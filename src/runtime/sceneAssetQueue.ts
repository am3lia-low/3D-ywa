import type { AssetRegistry } from "./assetRegistry";
import type {
  ResolvedSceneAsset,
  SceneAssetGenerationJob,
  SceneBuildManifest,
} from "./sceneBuildPipeline";
import type {
  GeneratedSceneAsset,
  SceneAssetOptimizer,
} from "./sceneAssetWorker";
import type {
  GeneratedReferenceImage,
  SceneReferenceImageProvider,
} from "./referenceImageProvider";

export type SceneAssetQueueStage =
  | "queued"
  | "generating_reference"
  | "needs_review"
  | "approved"
  | "reconstructing"
  | "optimizing"
  | "ready"
  | "rejected"
  | "failed";

export interface SceneAssetCandidate extends GeneratedReferenceImage {
  providerId: string;
  generatedAt: string;
}

export interface SceneAssetReview {
  decision: "approved" | "rejected";
  reviewer: "human" | "automated";
  reviewedAt: string;
  note?: string;
}

export interface SceneAssetCandidateValidation {
  validatorId: string;
  outcome: "pass" | "reject";
  reasons: string[];
  validatedAt: string;
}

export interface SceneAssetQueueItem {
  entityId: string;
  job: SceneAssetGenerationJob;
  stage: SceneAssetQueueStage;
  referenceAttempts: number;
  reconstructionAttempts: number;
  candidate?: SceneAssetCandidate;
  validation?: SceneAssetCandidateValidation;
  review?: SceneAssetReview;
  generated?: GeneratedSceneAsset;
  failedPhase?: "reference" | "reconstruction" | "optimization";
  error?: string;
  updatedAt: string;
}

export interface SceneAssetQueue {
  schemaVersion: "1.0";
  queueId: string;
  storyId: string;
  segmentId: string;
  snapshotVersion: number;
  planVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  items: SceneAssetQueueItem[];
}

export interface SceneAssetQueueStore {
  load(queueId: string): Promise<SceneAssetQueue | undefined>;
  save(queue: SceneAssetQueue): Promise<void>;
}

export interface SceneAssetReconstructionProvider {
  id: string;
  source: "project" | "cc0" | "generated";
  reconstruct(
    job: SceneAssetGenerationJob,
    reference: GeneratedReferenceImage,
    signal?: AbortSignal,
  ): Promise<GeneratedSceneAsset>;
}

export interface SceneAssetQueueEvent {
  entityId: string;
  stage: SceneAssetQueueStage;
  revision: number;
  message?: string;
}

export interface SceneAssetQueueRunOptions {
  entityIds?: readonly string[];
  signal?: AbortSignal;
  store?: SceneAssetQueueStore;
  now?: () => string;
  onProgress?: (event: SceneAssetQueueEvent) => void;
}

export interface SceneAssetCandidateValidator {
  id: string;
  validate(
    job: SceneAssetGenerationJob,
    candidate: SceneAssetCandidate,
    signal?: AbortSignal,
  ): Promise<{ outcome: "pass" | "reject"; reasons?: string[] }>;
}

export interface SceneAssetReferenceRunOptions extends SceneAssetQueueRunOptions {
  validator?: SceneAssetCandidateValidator;
}

export interface SceneAssetReconstructionRunOptions extends SceneAssetQueueRunOptions {
  optimizer?: SceneAssetOptimizer;
}

export interface SceneAssetQueueProviders {
  references: SceneReferenceImageProvider;
  reconstruction: SceneAssetReconstructionProvider;
}

export function createSceneAssetReconstructionRouter(
  providers: Partial<Record<SceneAssetGenerationJob["strategy"], SceneAssetReconstructionProvider>>,
): SceneAssetReconstructionProvider {
  return {
    id: "scene-asset-strategy-router",
    source: "generated",
    async reconstruct(job, reference, signal) {
      const provider = providers[job.strategy];
      if (!provider) {
        throw new Error(`No reconstruction provider is configured for '${job.strategy}'.`);
      }
      return provider.reconstruct(job, reference, signal);
    },
  };
}

export interface SceneAssetQueueAdvanceOptions extends SceneAssetReconstructionRunOptions {
  validator?: SceneAssetCandidateValidator;
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function timestamp(now?: () => string): string {
  return now?.() ?? new Date().toISOString();
}

function queueIdFor(manifest: SceneBuildManifest): string {
  return [manifest.storyId, manifest.segmentId, `snapshot-${manifest.snapshotVersion}`, `plan-${manifest.planVersion}`]
    .map((part) => part.replace(/[^A-Za-z0-9._-]+/g, "-"))
    .join(":");
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertReference(reference: GeneratedReferenceImage): void {
  if (!reference.base64.trim()) throw new Error("Generated reference image is empty.");
  if (
    reference.base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(reference.base64)
  ) {
    throw new Error("Generated reference image is not valid base64.");
  }
  if (!(["image/png", "image/jpeg", "image/webp"] as const).includes(reference.mimeType)) {
    throw new Error(`Generated reference image type '${reference.mimeType}' is unsupported.`);
  }
}

function assertGenerated(generated: GeneratedSceneAsset): void {
  if (!generated.asset.key.trim()) throw new Error("Generated asset key is empty.");
  if (
    generated.asset.dimensions.length !== 3 ||
    generated.asset.dimensions.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error("Generated asset dimensions must contain three positive finite values.");
  }
}

function updateItem(
  queue: SceneAssetQueue,
  entityId: string,
  changes: Partial<SceneAssetQueueItem>,
  now?: () => string,
): SceneAssetQueue {
  const updatedAt = timestamp(now);
  let found = false;
  const items = queue.items.map((item) => {
    if (item.entityId !== entityId) return item;
    found = true;
    return { ...item, ...changes, entityId: item.entityId, job: item.job, updatedAt };
  });
  if (!found) throw new Error(`Asset queue does not contain canonical entity '${entityId}'.`);
  return { ...queue, revision: queue.revision + 1, updatedAt, items };
}

async function persist(queue: SceneAssetQueue, store?: SceneAssetQueueStore): Promise<SceneAssetQueue> {
  await store?.save(queue);
  return queue;
}

function selected(item: SceneAssetQueueItem, entityIds?: readonly string[]): boolean {
  return !entityIds || entityIds.includes(item.entityId);
}

function emit(
  queue: SceneAssetQueue,
  entityId: string,
  stage: SceneAssetQueueStage,
  options: SceneAssetQueueRunOptions,
  message?: string,
): void {
  options.onProgress?.({ entityId, stage, revision: queue.revision, message });
}

export function createSceneAssetQueue(
  manifest: SceneBuildManifest,
  now?: () => string,
): SceneAssetQueue {
  const createdAt = timestamp(now);
  return {
    schemaVersion: "1.0",
    queueId: queueIdFor(manifest),
    storyId: manifest.storyId,
    segmentId: manifest.segmentId,
    snapshotVersion: manifest.snapshotVersion,
    planVersion: manifest.planVersion,
    revision: 0,
    createdAt,
    updatedAt: createdAt,
    items: manifest.generationJobs.map((job) => ({
      entityId: job.entityId,
      job,
      stage: "queued",
      referenceAttempts: 0,
      reconstructionAttempts: 0,
      updatedAt: createdAt,
    })),
  };
}

export function createWebStorageSceneAssetQueueStore(
  storage: KeyValueStorage,
  prefix = "storyworld:asset-queue:",
): SceneAssetQueueStore {
  return {
    async load(queueId) {
      const serialized = storage.getItem(`${prefix}${queueId}`);
      return serialized ? (JSON.parse(serialized) as SceneAssetQueue) : undefined;
    },
    async save(queue) {
      storage.setItem(`${prefix}${queue.queueId}`, JSON.stringify(queue));
    },
  };
}

/** Rejects empty or implausibly small/large image payloads before visual review. */
export function createReferenceImageIntegrityValidator(
  minimumBytes = 32_768,
  maximumBytes = 16 * 1024 * 1024,
): SceneAssetCandidateValidator {
  if (!Number.isInteger(minimumBytes) || minimumBytes < 1 || maximumBytes < minimumBytes) {
    throw new Error("Reference image byte limits are invalid.");
  }
  return {
    id: "reference-image-integrity-v1",
    async validate(_job, candidate) {
      const padding = candidate.base64.endsWith("==") ? 2 : candidate.base64.endsWith("=") ? 1 : 0;
      const byteLength = Math.floor(candidate.base64.length * 3 / 4) - padding;
      const reasons: string[] = [];
      if (byteLength < minimumBytes) reasons.push(`image is only ${byteLength} bytes`);
      if (byteLength > maximumBytes) reasons.push(`image is ${byteLength} bytes`);
      return { outcome: reasons.length > 0 ? "reject" : "pass", reasons };
    },
  };
}

/** Generates missing reference images and then pauses every successful item for review. */
export async function generateSceneAssetReferences(
  input: SceneAssetQueue,
  provider: SceneReferenceImageProvider,
  options: SceneAssetReferenceRunOptions = {},
): Promise<SceneAssetQueue> {
  let queue = input;
  for (const original of input.items) {
    if (original.stage !== "queued" || !selected(original, options.entityIds)) continue;
    if (options.signal?.aborted) throw options.signal.reason ?? new Error("Asset queue aborted.");

    queue = await persist(updateItem(queue, original.entityId, {
      stage: "generating_reference",
      referenceAttempts: original.referenceAttempts + 1,
      error: undefined,
      failedPhase: undefined,
    }, options.now), options.store);
    emit(queue, original.entityId, "generating_reference", options);

    try {
      const reference = await provider.generate(original.job, options.signal);
      assertReference(reference);
      const candidate: SceneAssetCandidate = {
        ...reference,
        providerId: provider.id,
        generatedAt: timestamp(options.now),
      };
      const checked = options.validator
        ? await options.validator.validate(original.job, candidate, options.signal)
        : undefined;
      const validation = checked ? {
        validatorId: options.validator!.id,
        outcome: checked.outcome,
        reasons: checked.reasons ?? [],
        validatedAt: timestamp(options.now),
      } satisfies SceneAssetCandidateValidation : undefined;
      const rejected = validation?.outcome === "reject";
      queue = await persist(updateItem(queue, original.entityId, {
        stage: rejected ? "rejected" : "needs_review",
        candidate,
        validation,
        review: rejected ? {
          decision: "rejected",
          reviewer: "automated",
          reviewedAt: timestamp(options.now),
          note: validation.reasons.join("; "),
        } : undefined,
      }, options.now), options.store);
      emit(queue, original.entityId, rejected ? "rejected" : "needs_review", options);
    } catch (error) {
      const message = failureMessage(error);
      queue = await persist(updateItem(queue, original.entityId, {
        stage: "failed",
        failedPhase: "reference",
        error: message,
      }, options.now), options.store);
      emit(queue, original.entityId, "failed", options, message);
    }
  }
  return queue;
}

export async function reviewSceneAssetCandidate(
  input: SceneAssetQueue,
  entityId: string,
  decision: "approved" | "rejected",
  options: Pick<SceneAssetQueueRunOptions, "store" | "now"> & { note?: string } = {},
): Promise<SceneAssetQueue> {
  const item = input.items.find((candidate) => candidate.entityId === entityId);
  if (!item) throw new Error(`Asset queue does not contain canonical entity '${entityId}'.`);
  if (item.stage !== "needs_review" || !item.candidate) {
    throw new Error(`Asset '${entityId}' does not have a candidate awaiting review.`);
  }
  return persist(updateItem(input, entityId, {
    stage: decision === "approved" ? "approved" : "rejected",
    review: { decision, reviewer: "human", reviewedAt: timestamp(options.now), note: options.note },
  }, options.now), options.store);
}

export async function retrySceneAsset(
  input: SceneAssetQueue,
  entityId: string,
  options: Pick<SceneAssetQueueRunOptions, "store" | "now"> = {},
): Promise<SceneAssetQueue> {
  const item = input.items.find((candidate) => candidate.entityId === entityId);
  if (!item) throw new Error(`Asset queue does not contain canonical entity '${entityId}'.`);
  if (item.stage !== "rejected" && item.stage !== "failed") {
    throw new Error(`Asset '${entityId}' is not rejected or failed.`);
  }
  const retryReconstruction =
    item.stage === "failed" &&
    (item.failedPhase === "reconstruction" || item.failedPhase === "optimization");
  return persist(updateItem(input, entityId, {
    stage: retryReconstruction ? "approved" : "queued",
    candidate: retryReconstruction ? item.candidate : undefined,
    validation: retryReconstruction ? item.validation : undefined,
    review: retryReconstruction ? item.review : undefined,
    generated: undefined,
    failedPhase: undefined,
    error: undefined,
  }, options.now), options.store);
}

/** Reconstructs only explicitly approved candidates; unreviewed images cannot be promoted. */
export async function reconstructApprovedSceneAssets(
  input: SceneAssetQueue,
  provider: SceneAssetReconstructionProvider,
  options: SceneAssetReconstructionRunOptions = {},
): Promise<SceneAssetQueue> {
  let queue = input;
  for (const original of input.items) {
    if (original.stage !== "approved" || !selected(original, options.entityIds)) continue;
    if (!original.candidate) throw new Error(`Approved asset '${original.entityId}' has no reference image.`);
    if (options.signal?.aborted) throw options.signal.reason ?? new Error("Asset queue aborted.");

    queue = await persist(updateItem(queue, original.entityId, {
      stage: "reconstructing",
      reconstructionAttempts: original.reconstructionAttempts + 1,
      error: undefined,
      failedPhase: undefined,
    }, options.now), options.store);
    emit(queue, original.entityId, "reconstructing", options);

    try {
      let generated = await provider.reconstruct(original.job, original.candidate, options.signal);
      assertGenerated(generated);
      if (options.optimizer) {
        queue = await persist(updateItem(queue, original.entityId, {
          stage: "optimizing",
        }, options.now), options.store);
        emit(queue, original.entityId, "optimizing", options);
        try {
          generated = await options.optimizer.optimize(generated, original.job, options.signal);
          assertGenerated(generated);
        } catch (error) {
          const message = failureMessage(error);
          queue = await persist(updateItem(queue, original.entityId, {
            stage: "failed",
            failedPhase: "optimization",
            error: message,
          }, options.now), options.store);
          emit(queue, original.entityId, "failed", options, message);
          continue;
        }
      }
      queue = await persist(updateItem(queue, original.entityId, {
        stage: "ready",
        generated,
      }, options.now), options.store);
      emit(queue, original.entityId, "ready", options);
    } catch (error) {
      const message = failureMessage(error);
      queue = await persist(updateItem(queue, original.entityId, {
        stage: "failed",
        failedPhase: "reconstruction",
        error: message,
      }, options.now), options.store);
      emit(queue, original.entityId, "failed", options, message);
    }
  }
  return queue;
}

/** Installs only ready queue outputs under their existing canonical entity IDs. */
export function promoteReadySceneAssets(
  manifest: SceneBuildManifest,
  queue: SceneAssetQueue,
): SceneBuildManifest {
  if (
    queue.storyId !== manifest.storyId ||
    queue.segmentId !== manifest.segmentId ||
    queue.snapshotVersion !== manifest.snapshotVersion ||
    queue.planVersion !== manifest.planVersion
  ) {
    throw new Error("Asset queue does not match the scene manifest version.");
  }

  let assetRegistry: AssetRegistry = manifest.assetRegistry;
  const ready = new Map(queue.items.filter((item) => item.stage === "ready" && item.generated).map((item) => [item.entityId, item]));
  const resolvedAssets: ResolvedSceneAsset[] = manifest.resolvedAssets.filter(
    (asset) => !ready.has(asset.entityId),
  );

  for (const item of ready.values()) {
    const generated = item.generated!;
    assetRegistry = { ...assetRegistry, [item.entityId]: generated.asset };
    resolvedAssets.push({
      entityId: item.entityId,
      assetKey: generated.asset.key,
      registryKey: item.entityId,
      source: "generated",
      catalogId: generated.artifactId,
    });
  }

  const generationJobs = manifest.generationJobs.filter((job) => !ready.has(job.entityId));
  return {
    ...manifest,
    status: manifest.missingVisualEntityIds.length > 0
      ? "needs_visual_plan"
      : generationJobs.length > 0
        ? "assets_pending"
        : "ready",
    assetRegistry,
    resolvedAssets,
    generationJobs,
  };
}

/** Advances every runnable item, pausing naturally at the human review boundary. */
export async function advanceSceneAssetQueue(
  manifest: SceneBuildManifest,
  input: SceneAssetQueue,
  providers: SceneAssetQueueProviders,
  options: SceneAssetQueueAdvanceOptions = {},
): Promise<{ queue: SceneAssetQueue; manifest: SceneBuildManifest }> {
  let queue = await generateSceneAssetReferences(input, providers.references, options);
  queue = await reconstructApprovedSceneAssets(queue, providers.reconstruction, options);
  return { queue, manifest: promoteReadySceneAssets(manifest, queue) };
}
