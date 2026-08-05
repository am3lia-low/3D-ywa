import type { AssetDefinition, AssetRegistry } from "./assetRegistry";
import type {
  ResolvedSceneAsset,
  SceneAssetGenerationJob,
  SceneBuildManifest,
} from "./sceneBuildPipeline";

export type SceneAssetWorkerStage =
  | "queued"
  | "generating"
  | "optimizing"
  | "completed"
  | "failed";

export interface SceneAssetWorkerEvent {
  entityId: string;
  stage: SceneAssetWorkerStage;
  providerId: string;
  message?: string;
}

export interface GeneratedSceneAsset {
  asset: AssetDefinition;
  /** Stable provider-side provenance ID, such as a Meshy task or catalog ID. */
  artifactId?: string;
}

/** Backend adapter boundary for an asset search or 3D generation service. */
export interface SceneAssetProvider {
  id: string;
  source: "project" | "cc0" | "generated";
  generate(
    job: SceneAssetGenerationJob,
    signal?: AbortSignal,
  ): Promise<GeneratedSceneAsset>;
}

export interface SceneAssetOptimizer {
  optimize(
    generated: GeneratedSceneAsset,
    job: SceneAssetGenerationJob,
    signal?: AbortSignal,
  ): Promise<GeneratedSceneAsset>;
}

export interface SceneAssetWorkerFailure {
  entityId: string;
  message: string;
}

export interface SceneAssetWorkerResult {
  manifest: SceneBuildManifest;
  completedEntityIds: string[];
  failures: SceneAssetWorkerFailure[];
}

export interface SceneAssetWorkerOptions {
  optimizer?: SceneAssetOptimizer;
  signal?: AbortSignal;
  onProgress?: (event: SceneAssetWorkerEvent) => void;
}

function assertUsableAsset(asset: AssetDefinition): void {
  if (!asset.key.trim()) throw new Error("Generated asset key is empty.");
  if (
    asset.dimensions.length !== 3 ||
    asset.dimensions.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error("Generated asset dimensions must contain three positive finite values.");
  }
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fulfils all pending asset jobs concurrently. Successful assets are installed
 * under the existing canonical entity ID; failed jobs remain retryable.
 */
export async function runSceneAssetWorker(
  manifest: SceneBuildManifest,
  provider: SceneAssetProvider,
  options: SceneAssetWorkerOptions = {},
): Promise<SceneAssetWorkerResult> {
  const emit = (entityId: string, stage: SceneAssetWorkerStage, message?: string) =>
    options.onProgress?.({ entityId, stage, providerId: provider.id, message });

  for (const job of manifest.generationJobs) emit(job.entityId, "queued");

  const attempts = await Promise.all(
    manifest.generationJobs.map(async (job) => {
      try {
        if (options.signal?.aborted) throw options.signal.reason ?? new Error("Asset build aborted.");
        emit(job.entityId, "generating");
        let generated = await provider.generate(job, options.signal);
        assertUsableAsset(generated.asset);

        if (options.optimizer) {
          emit(job.entityId, "optimizing");
          generated = await options.optimizer.optimize(generated, job, options.signal);
          assertUsableAsset(generated.asset);
        }

        emit(job.entityId, "completed");
        return { ok: true, job, generated } as const;
      } catch (error) {
        const message = failureMessage(error);
        emit(job.entityId, "failed", message);
        return { ok: false, job, error: message } as const;
      }
    }),
  );

  let assetRegistry: AssetRegistry = manifest.assetRegistry;
  const resolvedAssets: ResolvedSceneAsset[] = [...manifest.resolvedAssets];
  const remainingJobs: SceneAssetGenerationJob[] = [];
  const completedEntityIds: string[] = [];
  const failures: SceneAssetWorkerFailure[] = [];

  for (const attempt of attempts) {
    if (!attempt.ok) {
      remainingJobs.push(attempt.job);
      failures.push({ entityId: attempt.job.entityId, message: attempt.error });
      continue;
    }

    const { job, generated } = attempt;
    assetRegistry = { ...assetRegistry, [job.entityId]: generated.asset };
    resolvedAssets.push({
      entityId: job.entityId,
      assetKey: generated.asset.key,
      registryKey: job.entityId,
      source: provider.source,
      catalogId: generated.artifactId,
    });
    completedEntityIds.push(job.entityId);
  }

  const status =
    manifest.missingVisualEntityIds.length > 0
      ? "needs_visual_plan"
      : remainingJobs.length > 0
        ? "assets_pending"
        : "ready";

  return {
    manifest: {
      ...manifest,
      status,
      assetRegistry,
      resolvedAssets,
      generationJobs: remainingJobs,
    },
    completedEntityIds,
    failures,
  };
}
