import { describe, expect, it } from "vitest";

import snapshotFixture from "../../fixtures/snapshot_1.json";
import visualPlanFixture from "../../fixtures/visual_scene_plan_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import { createReviewedAssetPromotionBundle } from "./assetPromotionBundle";
import { defaultAssetRegistry } from "./assetRegistry";
import { buildSceneManifest } from "./sceneBuildPipeline";
import { createSceneAssetOutcomeReport } from "./sceneAssetOutcome";
import { createSceneAssetQueue, promoteReadySceneAssets, type SceneAssetQueue } from "./sceneAssetQueue";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const plan = visualPlanFixture as unknown as VisualScenePlan;
const now = () => "2026-08-07T00:00:00.000Z";

function pendingMapManifest() {
  const { "map-1": _map, ...registryWithoutMap } = defaultAssetRegistry;
  return buildSceneManifest(snapshot, plan, [], registryWithoutMap);
}

function readyMapQueue(): SceneAssetQueue {
  const queue = createSceneAssetQueue(pendingMapManifest(), now);
  return {
    ...queue,
    revision: 6,
    items: queue.items.map((item) => ({
      ...item,
      stage: "ready" as const,
      candidate: {
        mimeType: "image/png" as const,
        base64: "iVBORw==",
        artifactId: "reference:map-1:v1",
        providerId: "fixture-reference",
        generatedAt: now(),
      },
      review: { decision: "approved" as const, reviewer: "human" as const, reviewedAt: now() },
      reconstructionProviderId: "fixture-surface-template",
      reconstructionSource: "generated" as const,
      generated: {
        artifactId: "surface:map-1:v1",
        asset: {
          key: "generated-surface:document",
          geometry: "box" as const,
          dimensions: [0.92, 0.03, 0.64] as [number, number, number],
          color: "#ffffff",
          surfaceTextureUrl: "storyworld-candidate://approved-reference",
        },
      },
      assetReview: { decision: "approved" as const, reviewer: "human" as const, reviewedAt: now() },
    })),
  };
}

describe("reviewed asset promotion bundle", () => {
  it("exports only a twice-reviewed canonical runtime asset with provenance", () => {
    const bundle = createReviewedAssetPromotionBundle(pendingMapManifest(), readyMapQueue(), now);

    expect(bundle.assets).toHaveLength(1);
    expect(bundle.assets[0]).toMatchObject({
      entityId: "map-1",
      reconstructionProviderId: "fixture-surface-template",
      referenceReview: { decision: "approved", reviewer: "human" },
      assetReview: { decision: "approved", reviewer: "human" },
    });
    expect(bundle.assets[0]?.reference.base64).toBe("iVBORw==");
  });

  it("refuses durable export without final human in-world approval", () => {
    const queue = readyMapQueue();
    queue.items[0]!.assetReview = undefined;

    expect(() => createReviewedAssetPromotionBundle(pendingMapManifest(), queue, now)).toThrow(
      "missing human in-world approval",
    );
  });

  it("reports fallback, review and durable-promotion outcomes without blocking the reader", () => {
    const backgroundEntity = {
      id: "background-relic",
      name: "Unfamiliar background relic",
      kind: "artifact" as const,
      locationId: "attic-study",
    };
    const missingPlanEntity = {
      id: "undescribed-relic",
      name: "Undescribed relic",
      kind: "artifact" as const,
      locationId: "attic-study",
    };
    const extendedSnapshot: WorldSnapshot = {
      ...snapshot,
      entities: [...snapshot.entities, backgroundEntity, missingPlanEntity],
    };
    const extendedPlan: VisualScenePlan = {
      ...plan,
      entities: [
        ...plan.entities,
        {
          entityId: backgroundEntity.id,
          visualDescription: "A small incidental relic.",
          materials: ["stone"],
          colors: ["grey"],
          importance: "background",
          assetSearchTags: ["relic"],
          evidence: { passageIds: ["P1"], confidence: 0.8, basis: "explicit_text" },
        },
      ],
    };
    const manifest = buildSceneManifest(extendedSnapshot, extendedPlan);
    const report = createSceneAssetOutcomeReport(extendedSnapshot, extendedPlan, manifest);

    expect(report.readerCanExplore).toBe(true);
    expect(report.outcomes.find((item) => item.entityId === backgroundEntity.id)).toMatchObject({
      outcome: "designed_fallback_background",
      nextAction: "none",
      usesDesignedFallback: true,
    });
    expect(report.outcomes.find((item) => item.entityId === missingPlanEntity.id)).toMatchObject({
      outcome: "needs_visual_plan",
      nextAction: "provide_visual_plan",
    });

    const pendingManifest = pendingMapManifest();
    const readyQueue = readyMapQueue();
    const beforePromotion = createSceneAssetOutcomeReport(snapshot, plan, pendingManifest, readyQueue);
    expect(beforePromotion.outcomes.find((item) => item.entityId === "map-1")).toMatchObject({
      outcome: "ready_to_promote",
      nextAction: "promote",
      usesDesignedFallback: true,
    });
    const promotedManifest = promoteReadySceneAssets(pendingManifest, readyQueue);
    const afterPromotion = createSceneAssetOutcomeReport(snapshot, plan, promotedManifest, readyQueue);
    expect(afterPromotion.outcomes.find((item) => item.entityId === "map-1")).toMatchObject({
      outcome: "promoted_generated_asset",
      nextAction: "none",
      usesDesignedFallback: false,
    });
  });
});
