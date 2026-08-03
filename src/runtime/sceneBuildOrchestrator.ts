import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import { resolveApprovedAssetLibrary } from "./approvedAssetLibrary";
import type { AssetDefinition, AssetRegistry } from "./assetRegistry";
import {
  buildSceneManifest,
  type ResolvedSceneAsset,
  type SceneAssetGenerationJob,
  type SceneBuildManifest,
} from "./sceneBuildPipeline";
import type { GeneratedSceneAsset, SceneAssetProvider } from "./sceneAssetWorker";

export type AsyncSceneBuildStatus =
  | "queued"
  | "resolving"
  | "generating"
  | "reviewing"
  | "ready"
  | "partial"
  | "failed";

export type AsyncSceneBuildCandidateStatus =
  | "queued"
  | "generating"
  | "awaiting_review"
  | "approved"
  | "rejected"
  | "failed";

export interface AsyncSceneBuildCandidate {
  entityId: string;
  job: SceneAssetGenerationJob;
  status: AsyncSceneBuildCandidateStatus;
  generated?: GeneratedSceneAsset;
  previewedAt?: string;
  reviewedAt?: string;
  error?: string;
}

export interface AsyncSceneBuildProgress {
  totalEntities: number;
  approvedLibraryAssets: number;
  generationJobs: number;
  generatedCandidates: number;
  awaitingReview: number;
  approvedGeneratedAssets: number;
  failedOrRejected: number;
}

export interface AsyncSceneBuildRecord {
  schemaVersion: "1.0";
  buildId: string;
  cacheKey: string;
  providerId: string;
  storyId: string;
  segmentId: string;
  snapshotVersion: number;
  planVersion: number;
  status: AsyncSceneBuildStatus;
  manifest: SceneBuildManifest;
  candidates: AsyncSceneBuildCandidate[];
  progress: AsyncSceneBuildProgress;
  createdAt: string;
  updatedAt: string;
}

export interface AsyncSceneBuildStore {
  load(cacheKey: string): Promise<AsyncSceneBuildRecord | undefined>;
  save(record: AsyncSceneBuildRecord): Promise<void>;
}

export interface AsyncSceneBuildEvent {
  buildId: string;
  status: AsyncSceneBuildStatus;
  entityId?: string;
  candidateStatus?: AsyncSceneBuildCandidateStatus;
}

export interface AsyncSceneBuildOptions {
  now?: () => string;
  onProgress?: (event: AsyncSceneBuildEvent) => void;
  signal?: AbortSignal;
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function timestamp(now?: () => string): string {
  return now?.() ?? new Date().toISOString();
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableHash(value: unknown): string {
  const serialized = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function sceneBuildCacheKey(
  snapshot: WorldSnapshot,
  plan: VisualScenePlan,
  providerId: string,
): string {
  const prefix = [
    snapshot.storyId,
    plan.segmentId,
    `s${snapshot.version}`,
    `p${plan.planVersion}`,
    providerId,
  ]
    .map((value) => value.replace(/[^A-Za-z0-9._-]+/g, "-"))
    .join(":");
  return `${prefix}:${stableHash({ snapshot, plan })}`;
}

function progressFor(
  snapshot: WorldSnapshot,
  manifest: SceneBuildManifest,
  candidates: readonly AsyncSceneBuildCandidate[],
): AsyncSceneBuildProgress {
  return {
    totalEntities: snapshot.entities.length,
    approvedLibraryAssets: manifest.resolvedAssets.filter((asset) => asset.source !== "generated").length,
    generationJobs: candidates.length,
    generatedCandidates: candidates.filter((candidate) => candidate.generated).length,
    awaitingReview: candidates.filter((candidate) => candidate.status === "awaiting_review").length,
    approvedGeneratedAssets: candidates.filter((candidate) => candidate.status === "approved").length,
    failedOrRejected: candidates.filter(
      (candidate) => candidate.status === "failed" || candidate.status === "rejected",
    ).length,
  };
}

function candidateSummaryStatus(
  candidates: readonly AsyncSceneBuildCandidate[],
): AsyncSceneBuildStatus {
  if (candidates.length === 0 || candidates.every((candidate) => candidate.status === "approved")) {
    return "ready";
  }
  if (candidates.some((candidate) => candidate.status === "awaiting_review")) return "reviewing";
  if (candidates.some((candidate) => candidate.status === "generating")) return "generating";
  if (candidates.some((candidate) => candidate.status === "queued")) return "queued";
  if (candidates.some((candidate) => candidate.status === "approved")) return "partial";
  if (candidates.every((candidate) => candidate.status === "failed")) return "failed";
  return "partial";
}

function validateGenerated(job: SceneAssetGenerationJob, generated: GeneratedSceneAsset): void {
  if (!generated.asset.key.trim()) throw new Error(`Generated asset '${job.entityId}' has no key.`);
  if (
    generated.asset.dimensions.length !== 3 ||
    generated.asset.dimensions.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error(`Generated asset '${job.entityId}' has invalid dimensions.`);
  }
}

function promoteCandidate(
  manifest: SceneBuildManifest,
  candidate: AsyncSceneBuildCandidate,
): SceneBuildManifest {
  const generated = candidate.generated!;
  const resolved: ResolvedSceneAsset = {
    entityId: candidate.entityId,
    assetKey: generated.asset.key,
    registryKey: candidate.entityId,
    source: "generated",
    catalogId: generated.artifactId,
  };
  const generationJobs = manifest.generationJobs.filter(
    (job) => job.entityId !== candidate.entityId,
  );
  return {
    ...manifest,
    status: generationJobs.length > 0 ? "assets_pending" : "ready",
    assetRegistry: { ...manifest.assetRegistry, [candidate.entityId]: generated.asset },
    resolvedAssets: [
      ...manifest.resolvedAssets.filter((asset) => asset.entityId !== candidate.entityId),
      resolved,
    ],
    generationJobs,
  };
}

function updatedRecord(
  record: AsyncSceneBuildRecord,
  changes: Partial<AsyncSceneBuildRecord>,
  now?: () => string,
): AsyncSceneBuildRecord {
  const next = { ...record, ...changes, updatedAt: timestamp(now) };
  return {
    ...next,
    progress: {
      ...next.progress,
      generatedCandidates: next.candidates.filter((candidate) => candidate.generated).length,
      awaitingReview: next.candidates.filter((candidate) => candidate.status === "awaiting_review").length,
      approvedGeneratedAssets: next.candidates.filter((candidate) => candidate.status === "approved").length,
      failedOrRejected: next.candidates.filter(
        (candidate) => candidate.status === "failed" || candidate.status === "rejected",
      ).length,
    },
  };
}

export function createMemorySceneBuildStore(): AsyncSceneBuildStore {
  const records = new Map<string, AsyncSceneBuildRecord>();
  return {
    async load(cacheKey) {
      return records.get(cacheKey);
    },
    async save(record) {
      records.set(record.cacheKey, record);
    },
  };
}

export function createWebStorageSceneBuildStore(
  storage: KeyValueStorage,
  prefix = "storyworld:scene-build:v1:",
): AsyncSceneBuildStore {
  return {
    async load(cacheKey) {
      const serialized = storage.getItem(`${prefix}${cacheKey}`);
      return serialized ? JSON.parse(serialized) as AsyncSceneBuildRecord : undefined;
    },
    async save(record) {
      storage.setItem(`${prefix}${record.cacheKey}`, JSON.stringify(record));
    },
  };
}

export class AsyncSceneBuildOrchestrator {
  constructor(private readonly store: AsyncSceneBuildStore) {}

  async queue(
    snapshot: WorldSnapshot,
    plan: VisualScenePlan,
    providerId: string,
    options: AsyncSceneBuildOptions = {},
  ): Promise<{ record: AsyncSceneBuildRecord; cacheHit: boolean }> {
    const cacheKey = sceneBuildCacheKey(snapshot, plan, providerId);
    const cached = await this.store.load(cacheKey);
    if (cached) return { record: cached, cacheHit: true };

    const approved = resolveApprovedAssetLibrary(snapshot, plan);
    const manifest = buildSceneManifest(snapshot, plan, [], approved.assetRegistry);
    const createdAt = timestamp(options.now);
    const candidates: AsyncSceneBuildCandidate[] = manifest.generationJobs.map((job) => ({
      entityId: job.entityId,
      job,
      status: "queued",
    }));
    const record: AsyncSceneBuildRecord = {
      schemaVersion: "1.0",
      buildId: cacheKey,
      cacheKey,
      providerId,
      storyId: snapshot.storyId,
      segmentId: plan.segmentId,
      snapshotVersion: snapshot.version,
      planVersion: plan.planVersion,
      status: "queued",
      manifest,
      candidates,
      progress: progressFor(snapshot, manifest, candidates),
      createdAt,
      updatedAt: createdAt,
    };
    await this.store.save(record);
    options.onProgress?.({ buildId: record.buildId, status: "queued" });
    return { record, cacheHit: false };
  }

  async run(
    input: AsyncSceneBuildRecord,
    provider: SceneAssetProvider,
    options: AsyncSceneBuildOptions = {},
  ): Promise<AsyncSceneBuildRecord> {
    if (input.providerId !== provider.id) {
      throw new Error(`Build expects provider '${input.providerId}', not '${provider.id}'.`);
    }
    let record = updatedRecord(input, { status: "resolving" }, options.now);
    await this.store.save(record);
    options.onProgress?.({ buildId: record.buildId, status: "resolving" });

    if (record.candidates.length === 0) {
      record = updatedRecord(record, { status: "ready" }, options.now);
      await this.store.save(record);
      options.onProgress?.({ buildId: record.buildId, status: "ready" });
      return record;
    }

    record = updatedRecord(record, { status: "generating" }, options.now);
    await this.store.save(record);
    options.onProgress?.({ buildId: record.buildId, status: "generating" });

    for (const original of record.candidates) {
      if (original.status !== "queued" && original.status !== "failed") continue;
      if (options.signal?.aborted) throw options.signal.reason ?? new Error("Scene build aborted.");
      record = updatedRecord(record, {
        candidates: record.candidates.map((candidate) =>
          candidate.entityId === original.entityId
            ? { ...candidate, status: "generating", error: undefined }
            : candidate,
        ),
      }, options.now);
      await this.store.save(record);
      options.onProgress?.({
        buildId: record.buildId,
        status: "generating",
        entityId: original.entityId,
        candidateStatus: "generating",
      });
      try {
        const generated = await provider.generate(original.job, options.signal);
        validateGenerated(original.job, generated);
        record = updatedRecord(record, {
          candidates: record.candidates.map((candidate) =>
            candidate.entityId === original.entityId
              ? { ...candidate, status: "awaiting_review", generated }
              : candidate,
          ),
        }, options.now);
      } catch (error) {
        record = updatedRecord(record, {
          candidates: record.candidates.map((candidate) =>
            candidate.entityId === original.entityId
              ? {
                  ...candidate,
                  status: "failed",
                  error: error instanceof Error ? error.message : String(error),
                }
              : candidate,
          ),
        }, options.now);
      }
      await this.store.save(record);
    }

    record = updatedRecord(record, { status: candidateSummaryStatus(record.candidates) }, options.now);
    await this.store.save(record);
    options.onProgress?.({ buildId: record.buildId, status: record.status });
    return record;
  }

  async preview(
    input: AsyncSceneBuildRecord,
    entityId: string,
    options: Pick<AsyncSceneBuildOptions, "now"> = {},
  ): Promise<{ record: AsyncSceneBuildRecord; assetRegistry: AssetRegistry }> {
    const candidate = input.candidates.find((item) => item.entityId === entityId);
    if (!candidate?.generated || candidate.status !== "awaiting_review") {
      throw new Error(`Candidate '${entityId}' is not awaiting review.`);
    }
    const record = updatedRecord(input, {
      candidates: input.candidates.map((item) =>
        item.entityId === entityId ? { ...item, previewedAt: timestamp(options.now) } : item,
      ),
    }, options.now);
    await this.store.save(record);
    return {
      record,
      assetRegistry: { ...record.manifest.assetRegistry, [entityId]: candidate.generated.asset },
    };
  }

  async review(
    input: AsyncSceneBuildRecord,
    entityId: string,
    decision: "approved" | "rejected",
    options: Pick<AsyncSceneBuildOptions, "now"> = {},
  ): Promise<AsyncSceneBuildRecord> {
    const candidate = input.candidates.find((item) => item.entityId === entityId);
    if (!candidate?.generated || candidate.status !== "awaiting_review") {
      throw new Error(`Candidate '${entityId}' is not awaiting review.`);
    }
    if (decision === "approved" && !candidate.previewedAt) {
      throw new Error(`Candidate '${entityId}' must be previewed before approval.`);
    }
    const reviewedCandidate: AsyncSceneBuildCandidate = {
      ...candidate,
      status: decision === "approved" ? "approved" : "rejected",
      reviewedAt: timestamp(options.now),
    };
    const candidates = input.candidates.map((item) =>
      item.entityId === entityId ? reviewedCandidate : item,
    );
    const manifest = decision === "approved"
      ? promoteCandidate(input.manifest, reviewedCandidate)
      : input.manifest;
    const record = updatedRecord(input, {
      candidates,
      manifest,
      status: candidateSummaryStatus(candidates),
    }, options.now);
    await this.store.save(record);
    return record;
  }

  async retry(
    input: AsyncSceneBuildRecord,
    entityId: string,
    options: Pick<AsyncSceneBuildOptions, "now"> = {},
  ): Promise<AsyncSceneBuildRecord> {
    const candidate = input.candidates.find((item) => item.entityId === entityId);
    if (!candidate || (candidate.status !== "failed" && candidate.status !== "rejected")) {
      throw new Error(`Candidate '${entityId}' is not failed or rejected.`);
    }
    const candidates = input.candidates.map((item) =>
      item.entityId === entityId
        ? {
            ...item,
            status: "queued" as const,
            generated: undefined,
            previewedAt: undefined,
            reviewedAt: undefined,
            error: undefined,
          }
        : item,
    );
    const record = updatedRecord(input, { candidates, status: "queued" }, options.now);
    await this.store.save(record);
    return record;
  }
}

/** Deterministic final-asset provider used only to exercise orchestration locally. */
export function createDeterministicMockSceneAssetProvider(): SceneAssetProvider {
  return {
    id: "deterministic-mock-final-asset-v1",
    source: "generated",
    async generate(job) {
      const hash = Number.parseInt(stableHash({ entityId: job.entityId, prompt: job.prompt }), 16);
      const colors = ["#4f8b78", "#b78343", "#6d75a8", "#9a5f54"];
      const asset: AssetDefinition = {
        key: `generated:mock:${job.entityId}`,
        geometry: job.strategy === "surface_template" ? "box" : "sphere",
        dimensions: job.dimensions ?? (job.strategy === "surface_template"
          ? [1, 0.06, 0.72]
          : [0.9, 0.9, 0.9]),
        color: colors[hash % colors.length]!,
        roughness: 0.62,
        metalness: job.strategy === "image_to_mesh" ? 0.28 : 0.02,
      };
      return { asset, artifactId: `mock:${stableHash({ job, asset })}` };
    },
  };
}
