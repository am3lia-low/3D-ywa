import { describe, expect, it } from "vitest";

import snapshotFixture from "../../fixtures/snapshot_1.json";
import visualPlanFixture from "../../fixtures/visual_scene_plan_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import { compileSceneRecipe } from "./sceneRecipeCompiler";
import {
  resolvePromotedStoryAssets,
  type PromotedStoryAssetCatalog,
} from "./promotedStoryAssets";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const plan = visualPlanFixture as unknown as VisualScenePlan;

function promotion(
  promotionId: string,
  storyId: string,
  entityId: string,
  snapshotVersion: number,
  modelUrl: string,
) {
  return {
    promotionId,
    storyId,
    entityId,
    snapshotVersion,
    planVersion: snapshotVersion,
    artifactId: `${promotionId}:artifact`,
    promotedAt: `2026-08-0${snapshotVersion}T00:00:00.000Z`,
    referenceProviderId: "fixture-reference",
    reconstructionProviderId: "fixture-reconstruction",
    referenceReviewedAt: "2026-08-01T00:00:00.000Z",
    assetReviewedAt: "2026-08-01T00:05:00.000Z",
    runtimeAsset: {
      key: "generated:document",
      geometry: "box" as const,
      dimensions: [0.92, 0.03, 0.64] as [number, number, number],
      color: "#d8bd80",
      modelUrl,
    },
  };
}

describe("promoted story assets", () => {
  it("reuses only the newest promotion valid for the same story and canonical entity", () => {
    const catalog: PromotedStoryAssetCatalog = {
      schemaVersion: "1.0",
      assets: [
        promotion("map-v1", snapshot.storyId, "map-1", 1, "/generated/promoted/map-v1.glb"),
        promotion("map-future", snapshot.storyId, "map-1", 3, "/generated/promoted/map-v3.glb"),
        promotion("other-story", "another-story", "map-1", 1, "/generated/promoted/other.glb"),
      ],
    };
    const result = resolvePromotedStoryAssets({ ...snapshot, version: 2 }, catalog);

    expect(result.selections.map((selection) => selection.promotionId)).toEqual(["map-v1"]);
    expect(result.assetRegistry["map-1"]?.modelUrl).toBe("/generated/promoted/map-v1.glb");
  });

  it("lets a reviewed story-specific promotion override a generic approved match", () => {
    const catalog: PromotedStoryAssetCatalog = {
      schemaVersion: "1.0",
      assets: [promotion("map-reviewed", snapshot.storyId, "map-1", 1, "/generated/promoted/map-reviewed.glb")],
    };
    const recipe = compileSceneRecipe(snapshot, plan, { promotedAssetCatalog: catalog });

    expect(recipe.promotedAssets.map((selection) => selection.promotionId)).toEqual(["map-reviewed"]);
    expect(recipe.assetRegistry["map-1"]?.modelUrl).toBe("/generated/promoted/map-reviewed.glb");
    expect(recipe.coverage.approved).toBe(snapshot.entities.length);
  });
});
