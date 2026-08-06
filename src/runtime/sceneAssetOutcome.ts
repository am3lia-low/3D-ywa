import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import type { SceneBuildManifest } from "./sceneBuildPipeline";
import type { SceneAssetQueue, SceneAssetQueueStage } from "./sceneAssetQueue";

export type SceneAssetOutcomeKind =
  | "approved_asset"
  | "promoted_generated_asset"
  | "designed_fallback_background"
  | "needs_visual_plan"
  | "generation_queued"
  | "generating_reference"
  | "needs_reference_review"
  | "reference_approved"
  | "reconstructing"
  | "optimizing"
  | "needs_asset_review"
  | "ready_to_promote"
  | "generation_rejected"
  | "generation_failed";

export type SceneAssetOutcomeAction =
  | "none"
  | "provide_visual_plan"
  | "run_provider"
  | "review_reference"
  | "build_runtime_asset"
  | "review_runtime_asset"
  | "promote"
  | "retry";

export interface SceneAssetOutcome {
  entityId: string;
  importance: "background" | "supporting" | "hero" | "unknown";
  outcome: SceneAssetOutcomeKind;
  nextAction: SceneAssetOutcomeAction;
  readerRenderable: true;
  usesDesignedFallback: boolean;
  message: string;
}

export interface SceneAssetOutcomeReport {
  storyId: string;
  segmentId: string;
  snapshotVersion: number;
  planVersion: number;
  readerCanExplore: true;
  outcomes: SceneAssetOutcome[];
  counts: Record<SceneAssetOutcomeKind, number>;
}

const EMPTY_COUNTS: Record<SceneAssetOutcomeKind, number> = {
  approved_asset: 0,
  promoted_generated_asset: 0,
  designed_fallback_background: 0,
  needs_visual_plan: 0,
  generation_queued: 0,
  generating_reference: 0,
  needs_reference_review: 0,
  reference_approved: 0,
  reconstructing: 0,
  optimizing: 0,
  needs_asset_review: 0,
  ready_to_promote: 0,
  generation_rejected: 0,
  generation_failed: 0,
};

function queueOutcome(stage: SceneAssetQueueStage): Pick<SceneAssetOutcome, "outcome" | "nextAction" | "message"> {
  switch (stage) {
    case "queued":
      return { outcome: "generation_queued", nextAction: "run_provider", message: "Fallback is visible while the internal asset job waits to run." };
    case "generating_reference":
      return { outcome: "generating_reference", nextAction: "none", message: "Fallback is visible while a reference image is generated." };
    case "needs_review":
      return { outcome: "needs_reference_review", nextAction: "review_reference", message: "Fallback remains until the generated reference is reviewed." };
    case "approved":
      return { outcome: "reference_approved", nextAction: "build_runtime_asset", message: "The reference is approved and ready for reconstruction." };
    case "reconstructing":
      return { outcome: "reconstructing", nextAction: "none", message: "Fallback is visible while the runtime mesh is reconstructed." };
    case "optimizing":
      return { outcome: "optimizing", nextAction: "none", message: "Fallback is visible while the runtime asset is optimized." };
    case "needs_asset_review":
      return { outcome: "needs_asset_review", nextAction: "review_runtime_asset", message: "The candidate must be previewed and reviewed in the world." };
    case "ready":
      return { outcome: "ready_to_promote", nextAction: "promote", message: "Both reviews passed; export and materialize the durable asset." };
    case "rejected":
      return { outcome: "generation_rejected", nextAction: "retry", message: "The rejected candidate is isolated; the fallback remains active." };
    case "failed":
      return { outcome: "generation_failed", nextAction: "retry", message: "The provider failed; the fallback remains active and the job is retryable." };
  }
}

/** Produces one explicit reader-safe outcome for every canonical entity. */
export function createSceneAssetOutcomeReport(
  snapshot: WorldSnapshot,
  plan: VisualScenePlan,
  manifest: SceneBuildManifest,
  queue?: SceneAssetQueue,
): SceneAssetOutcomeReport {
  if (
    snapshot.storyId !== manifest.storyId ||
    plan.storyId !== manifest.storyId ||
    plan.segmentId !== manifest.segmentId
  ) {
    throw new Error("Snapshot, visual plan and scene manifest do not describe the same build.");
  }
  const visualById = new Map(plan.entities.map((entity) => [entity.entityId, entity]));
  const resolvedById = new Map(manifest.resolvedAssets.map((asset) => [asset.entityId, asset]));
  const missingVisual = new Set(manifest.missingVisualEntityIds);
  const queued = new Map(queue?.items.map((item) => [item.entityId, item]) ?? []);
  const jobIds = new Set(manifest.generationJobs.map((job) => job.entityId));

  const outcomes = snapshot.entities.map((entity): SceneAssetOutcome => {
    const importance = visualById.get(entity.id)?.importance ?? "unknown";
    const resolved = resolvedById.get(entity.id);
    if (resolved) {
      const generated = resolved.source === "generated";
      return {
        entityId: entity.id,
        importance,
        outcome: generated ? "promoted_generated_asset" : "approved_asset",
        nextAction: "none",
        readerRenderable: true,
        usesDesignedFallback: false,
        message: generated
          ? "A reviewed generated asset is installed under the canonical entity ID."
          : "An approved catalog asset is installed under the canonical entity ID.",
      };
    }
    if (missingVisual.has(entity.id)) {
      return {
        entityId: entity.id,
        importance,
        outcome: "needs_visual_plan",
        nextAction: "provide_visual_plan",
        readerRenderable: true,
        usesDesignedFallback: true,
        message: "The fallback is visible, but generation needs a VisualScenePlan description.",
      };
    }
    const item = queued.get(entity.id);
    if (item) {
      return {
        entityId: entity.id,
        importance,
        ...queueOutcome(item.stage),
        readerRenderable: true,
        usesDesignedFallback: true,
      };
    }
    if (jobIds.has(entity.id)) {
      return {
        entityId: entity.id,
        importance,
        outcome: "generation_queued",
        nextAction: "run_provider",
        readerRenderable: true,
        usesDesignedFallback: true,
        message: "Fallback is visible and a supporting or hero asset job is queued.",
      };
    }
    return {
      entityId: entity.id,
      importance,
      outcome: "designed_fallback_background",
      nextAction: "none",
      readerRenderable: true,
      usesDesignedFallback: true,
      message: "The background object keeps a lightweight designed fallback.",
    };
  });
  const counts = { ...EMPTY_COUNTS };
  for (const outcome of outcomes) counts[outcome.outcome] += 1;
  return {
    storyId: manifest.storyId,
    segmentId: manifest.segmentId,
    snapshotVersion: manifest.snapshotVersion,
    planVersion: manifest.planVersion,
    readerCanExplore: true,
    outcomes,
    counts,
  };
}
