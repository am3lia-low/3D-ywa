import { describe, expect, it, vi } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import visualPlanFixture from "../../fixtures/visual_scene_plan_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import { defaultAssetRegistry } from "./assetRegistry";
import { runSceneAssetWorker, type SceneAssetWorkerEvent } from "./sceneAssetWorker";
import { buildSceneManifest } from "./sceneBuildPipeline";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const plan = visualPlanFixture as unknown as VisualScenePlan;

describe("scene asset worker", () => {
  it("fulfils a pending job under its canonical story entity ID", async () => {
    const { "map-1": _map, ...registryWithoutMap } = defaultAssetRegistry;
    const pending = buildSceneManifest(snapshot, plan, [], registryWithoutMap);
    const events: SceneAssetWorkerEvent[] = [];
    const optimize = vi.fn(async (generated) => generated);

    const result = await runSceneAssetWorker(
      pending,
      {
        id: "fixture-generator",
        source: "generated",
        generate: async (job) => ({
          artifactId: `artifact:${job.entityId}`,
          asset: {
            key: "generated-map",
            geometry: "box",
            dimensions: [0.55, 0.08, 0.4],
            color: "#c8aa72",
            modelUrl: "/generated/map-1.glb",
          },
        }),
      },
      { optimizer: { optimize }, onProgress: (event) => events.push(event) },
    );

    expect(result.manifest.status).toBe("ready");
    expect(result.completedEntityIds).toEqual(["map-1"]);
    expect(result.manifest.assetRegistry["map-1"]?.modelUrl).toBe("/generated/map-1.glb");
    expect(result.manifest.resolvedAssets.at(-1)).toMatchObject({
      entityId: "map-1",
      registryKey: "map-1",
      source: "generated",
      catalogId: "artifact:map-1",
    });
    expect(result.manifest.generationJobs).toEqual([]);
    expect(optimize).toHaveBeenCalledOnce();
    expect(events.map((event) => event.stage)).toEqual([
      "queued",
      "generating",
      "optimizing",
      "completed",
    ]);
  });

  it("keeps a failed job retryable instead of corrupting the registry", async () => {
    const { "map-1": _map, ...registryWithoutMap } = defaultAssetRegistry;
    const pending = buildSceneManifest(snapshot, plan, [], registryWithoutMap);

    const result = await runSceneAssetWorker(pending, {
      id: "offline-provider",
      source: "generated",
      generate: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(result.manifest.status).toBe("assets_pending");
    expect(result.manifest.generationJobs.map((job) => job.entityId)).toEqual(["map-1"]);
    expect(result.manifest.assetRegistry["map-1"]).toBeUndefined();
    expect(result.failures).toEqual([
      { entityId: "map-1", message: "provider unavailable" },
    ]);
  });
});
