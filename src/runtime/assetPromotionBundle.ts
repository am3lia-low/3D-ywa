import type { AssetDefinition } from "./assetRegistry";
import type { SceneAssetGenerationJob, SceneBuildManifest } from "./sceneBuildPipeline";
import type {
  SceneAssetCandidate,
  SceneAssetCandidateValidation,
  SceneAssetQueue,
  SceneAssetReview,
} from "./sceneAssetQueue";

export interface ReviewedAssetPromotionItem {
  promotionId: string;
  entityId: string;
  job: SceneAssetGenerationJob;
  reference: SceneAssetCandidate;
  referenceValidation?: SceneAssetCandidateValidation;
  referenceReview: SceneAssetReview & { decision: "approved"; reviewer: "human" };
  reconstructionProviderId: string;
  reconstructionSource: "project" | "cc0" | "generated";
  artifactId?: string;
  runtimeAsset: AssetDefinition;
  assetReview: SceneAssetReview & { decision: "approved"; reviewer: "human" };
}

export interface ReviewedAssetPromotionBundle {
  schemaVersion: "1.0";
  bundleId: string;
  exportedAt: string;
  storyId: string;
  segmentId: string;
  snapshotVersion: number;
  planVersion: number;
  queueRevision: number;
  assets: ReviewedAssetPromotionItem[];
}

function safePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

function assertMatchingVersions(manifest: SceneBuildManifest, queue: SceneAssetQueue): void {
  if (
    queue.storyId !== manifest.storyId ||
    queue.segmentId !== manifest.segmentId ||
    queue.snapshotVersion !== manifest.snapshotVersion ||
    queue.planVersion !== manifest.planVersion
  ) {
    throw new Error("Asset queue does not match the scene manifest version.");
  }
}

/**
 * Creates the handoff consumed by the offline materializer. Only assets with
 * two explicit human approvals can leave the browser-local review session.
 */
export function createReviewedAssetPromotionBundle(
  manifest: SceneBuildManifest,
  queue: SceneAssetQueue,
  now: () => string = () => new Date().toISOString(),
): ReviewedAssetPromotionBundle {
  assertMatchingVersions(manifest, queue);
  const ready = queue.items.filter((item) => item.stage === "ready");
  if (ready.length === 0) {
    throw new Error("The queue has no reviewed runtime assets ready for durable promotion.");
  }
  const assets = ready.map((item): ReviewedAssetPromotionItem => {
    if (!item.candidate || !item.generated) {
      throw new Error(`Ready asset '${item.entityId}' is missing its reference or runtime artifact.`);
    }
    if (item.review?.decision !== "approved" || item.review.reviewer !== "human") {
      throw new Error(`Ready asset '${item.entityId}' is missing human reference approval.`);
    }
    if (item.assetReview?.decision !== "approved" || item.assetReview.reviewer !== "human") {
      throw new Error(`Ready asset '${item.entityId}' is missing human in-world approval.`);
    }
    if (!item.reconstructionProviderId || !item.reconstructionSource) {
      throw new Error(`Ready asset '${item.entityId}' is missing reconstruction provenance.`);
    }
    return {
      promotionId: [
        safePart(queue.storyId),
        safePart(item.entityId),
        `s${queue.snapshotVersion}`,
        `p${queue.planVersion}`,
        safePart(item.generated.artifactId ?? item.generated.asset.key),
      ].join("--"),
      entityId: item.entityId,
      job: item.job,
      reference: item.candidate,
      referenceValidation: item.validation,
      referenceReview: item.review as ReviewedAssetPromotionItem["referenceReview"],
      reconstructionProviderId: item.reconstructionProviderId,
      reconstructionSource: item.reconstructionSource,
      artifactId: item.generated.artifactId,
      runtimeAsset: item.generated.asset,
      assetReview: item.assetReview as ReviewedAssetPromotionItem["assetReview"],
    };
  });
  return {
    schemaVersion: "1.0",
    bundleId: `${queue.queueId}:r${queue.revision}`,
    exportedAt: now(),
    storyId: queue.storyId,
    segmentId: queue.segmentId,
    snapshotVersion: queue.snapshotVersion,
    planVersion: queue.planVersion,
    queueRevision: queue.revision,
    assets,
  };
}
