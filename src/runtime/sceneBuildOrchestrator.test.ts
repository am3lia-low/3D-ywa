import { describe, expect, it } from "vitest";
import atticSnapshotFixture from "../../fixtures/snapshot_1.json";
import atticPlanFixture from "../../fixtures/visual_scene_plan_1.json";
import conservatorySnapshotFixture from "../../fixtures/snapshot_conservatory_1.json";
import conservatoryPlanFixture from "../../fixtures/visual_scene_plan_conservatory_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import type { SceneAssetProvider } from "./sceneAssetWorker";
import {
  AsyncSceneBuildOrchestrator,
  createDeterministicMockSceneAssetProvider,
  createMemorySceneBuildStore,
  sceneBuildCacheKey,
  type AsyncSceneBuildEvent,
} from "./sceneBuildOrchestrator";

const atticSnapshot = atticSnapshotFixture as unknown as WorldSnapshot;
const atticPlan = atticPlanFixture as unknown as VisualScenePlan;
const conservatorySnapshot = conservatorySnapshotFixture as unknown as WorldSnapshot;
const conservatoryPlan = conservatoryPlanFixture as unknown as VisualScenePlan;

describe("asynchronous scene build orchestrator", () => {
  it("uses deterministic content-aware cache keys", () => {
    const providerId = "provider-v1";
    const first = sceneBuildCacheKey(conservatorySnapshot, conservatoryPlan, providerId);
    const same = sceneBuildCacheKey(conservatorySnapshot, conservatoryPlan, providerId);
    const changed = sceneBuildCacheKey(
      conservatorySnapshot,
      { ...conservatoryPlan, artDirection: { ...conservatoryPlan.artDirection, stylePrompt: "Changed" } },
      providerId,
    );

    expect(same).toBe(first);
    expect(changed).not.toBe(first);
    expect(first).toContain("story-moonlit-conservatory");
  });

  it("resolves approved assets, generates only the hero gap, and pauses for review", async () => {
    const events: AsyncSceneBuildEvent[] = [];
    const orchestrator = new AsyncSceneBuildOrchestrator(createMemorySceneBuildStore());
    const provider = createDeterministicMockSceneAssetProvider();
    const queued = await orchestrator.queue(conservatorySnapshot, conservatoryPlan, provider.id, {
      onProgress: (event) => events.push(event),
    });
    const generated = await orchestrator.run(queued.record, provider, {
      onProgress: (event) => events.push(event),
    });

    expect(queued.cacheHit).toBe(false);
    expect(queued.record.progress.approvedLibraryAssets).toBe(4);
    expect(queued.record.candidates.map((candidate) => candidate.entityId)).toEqual(["orrery-1"]);
    expect(generated.status).toBe("reviewing");
    expect(generated.candidates[0]).toMatchObject({
      entityId: "orrery-1",
      status: "awaiting_review",
    });
    expect(generated.manifest.assetRegistry["orrery-1"]).toBeUndefined();
    expect(events.map((event) => event.status)).toEqual([
      "queued",
      "resolving",
      "generating",
      "generating",
      "reviewing",
    ]);
  });

  it("requires in-world preview before canonical promotion", async () => {
    const store = createMemorySceneBuildStore();
    const orchestrator = new AsyncSceneBuildOrchestrator(store);
    const provider = createDeterministicMockSceneAssetProvider();
    const queued = await orchestrator.queue(conservatorySnapshot, conservatoryPlan, provider.id);
    const generated = await orchestrator.run(queued.record, provider);

    await expect(orchestrator.review(generated, "orrery-1", "approved"))
      .rejects.toThrow("must be previewed before approval");
    const previewed = await orchestrator.preview(generated, "orrery-1");
    expect(previewed.assetRegistry["orrery-1"]?.key).toBe("generated:mock:orrery-1");
    expect(previewed.record.manifest.assetRegistry["orrery-1"]).toBeUndefined();

    const approved = await orchestrator.review(previewed.record, "orrery-1", "approved");
    expect(approved.status).toBe("ready");
    expect(approved.manifest.status).toBe("ready");
    expect(approved.manifest.assetRegistry["orrery-1"]?.key).toBe("generated:mock:orrery-1");
    expect(approved.manifest.generationJobs).toEqual([]);

    const cached = await orchestrator.queue(conservatorySnapshot, conservatoryPlan, provider.id);
    expect(cached.cacheHit).toBe(true);
    expect(cached.record.status).toBe("ready");
  });

  it("finishes immediately when the approved library already covers the story", async () => {
    const orchestrator = new AsyncSceneBuildOrchestrator(createMemorySceneBuildStore());
    const provider = createDeterministicMockSceneAssetProvider();
    const queued = await orchestrator.queue(atticSnapshot, atticPlan, provider.id);
    const ready = await orchestrator.run(queued.record, provider);

    expect(ready.status).toBe("ready");
    expect(ready.progress).toMatchObject({ generationJobs: 0, approvedLibraryAssets: 8 });
  });

  it("keeps provider failures explicit and retryable", async () => {
    const orchestrator = new AsyncSceneBuildOrchestrator(createMemorySceneBuildStore());
    const provider: SceneAssetProvider = {
      id: "offline-provider",
      source: "generated",
      async generate() {
        throw new Error("provider offline");
      },
    };
    const queued = await orchestrator.queue(conservatorySnapshot, conservatoryPlan, provider.id);
    const failed = await orchestrator.run(queued.record, provider);

    expect(failed.status).toBe("failed");
    expect(failed.candidates[0]).toMatchObject({ status: "failed", error: "provider offline" });
    expect(failed.manifest.assetRegistry["orrery-1"]).toBeUndefined();

    const retry = await orchestrator.retry(failed, "orrery-1");
    expect(retry.status).toBe("queued");
    expect(retry.candidates[0]).toMatchObject({ status: "queued", generated: undefined });
  });
});
