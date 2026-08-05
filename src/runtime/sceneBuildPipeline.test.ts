import { describe, expect, it } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import visualPlanFixture from "../../fixtures/visual_scene_plan_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import { defaultAssetRegistry } from "./assetRegistry";
import { buildSceneManifest, type SceneAssetCatalogEntry } from "./sceneBuildPipeline";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const plan = visualPlanFixture as unknown as VisualScenePlan;

describe("scene build pipeline", () => {
  it("turns the Part 1 fixtures into a ready executable build", () => {
    const manifest = buildSceneManifest(snapshot, plan);

    expect(manifest.status).toBe("ready");
    expect(manifest.storyId).toBe(snapshot.storyId);
    expect(manifest.presentations["attic-study"]?.styleLabel).toBe(
      "hand-painted storybook realism",
    );
    expect(manifest.resolvedAssets).toHaveLength(snapshot.entities.length);
    expect(manifest.resolvedAssets.find((asset) => asset.entityId === "map-1")).toMatchObject({
      assetKey: "map",
      registryKey: "map-1",
    });
    expect(manifest.generationJobs).toEqual([]);
    expect(manifest.assetRegistry).toBe(defaultAssetRegistry);
  });

  it("emits an async generation job when a planned hero asset cannot resolve", () => {
    const { "map-1": _map, ...registryWithoutMap } = defaultAssetRegistry;
    const manifest = buildSceneManifest(snapshot, plan, [], registryWithoutMap);

    expect(manifest.status).toBe("assets_pending");
    expect(manifest.generationJobs).toHaveLength(1);
    expect(manifest.generationJobs[0]).toMatchObject({
      entityId: "map-1",
      locationId: "attic-study",
      priority: "supporting",
      strategy: "surface_template",
      reason: "no_catalog_match",
    });
  });

  it("resolves a catalog match under the canonical entity ID", () => {
    const { "map-1": _map, ...registryWithoutMap } = defaultAssetRegistry;
    const catalog: SceneAssetCatalogEntry[] = [
      {
        catalogId: "generated-antique-map-v1",
        asset: {
          key: "map",
          geometry: "box",
          dimensions: [0.92, 0.025, 0.64],
          color: "#d8bd80",
        },
        tags: ["antique", "parchment", "map", "document"],
        entityKinds: ["document"],
        source: "generated",
      },
    ];

    const manifest = buildSceneManifest(snapshot, plan, catalog, registryWithoutMap);

    expect(manifest.status).toBe("ready");
    expect(manifest.assetRegistry["map-1"]?.key).toBe("map");
    expect(manifest.resolvedAssets.find((asset) => asset.entityId === "map-1")).toMatchObject({
      source: "generated",
      catalogId: "generated-antique-map-v1",
      registryKey: "map-1",
    });
  });
});
