import { describe, expect, it, vi } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import visualPlanFixture from "../../fixtures/visual_scene_plan_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import { defaultAssetRegistry } from "./assetRegistry";
import { buildSceneManifest } from "./sceneBuildPipeline";
import {
  advanceSceneAssetQueue,
  createSceneAssetQueue,
  createReferenceImageIntegrityValidator,
  createSceneAssetReconstructionRouter,
  createWebStorageSceneAssetQueueStore,
  generateSceneAssetReferences,
  promoteReadySceneAssets,
  reconstructApprovedSceneAssets,
  retrySceneAsset,
  reviewReconstructedSceneAsset,
  reviewSceneAssetCandidate,
  type SceneAssetQueueEvent,
} from "./sceneAssetQueue";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const plan = visualPlanFixture as unknown as VisualScenePlan;
const now = () => "2026-08-03T00:00:00.000Z";

function pendingMapManifest() {
  const { "map-1": _map, ...registryWithoutMap } = defaultAssetRegistry;
  return buildSceneManifest(snapshot, plan, [], registryWithoutMap);
}

describe("scene asset queue", () => {
  it("persists a canonical, versioned queue that can resume after reload", async () => {
    const values = new Map<string, string>();
    const store = createWebStorageSceneAssetQueueStore({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    });
    const queue = createSceneAssetQueue(pendingMapManifest(), now);

    await store.save(queue);
    const reloaded = await store.load(queue.queueId);

    expect(queue.queueId).toBe("story-attic-study:attic-opening:snapshot-1:plan-1");
    expect(reloaded).toEqual(queue);
    expect(reloaded?.items[0]).toMatchObject({
      entityId: "map-1",
      stage: "queued",
      referenceAttempts: 0,
      reconstructionAttempts: 0,
    });
  });

  it("pauses for approval, reconstructs the reviewed candidate, and promotes it", async () => {
    const manifest = pendingMapManifest();
    const events: SceneAssetQueueEvent[] = [];
    const saves: number[] = [];
    const store = {
      load: async () => undefined,
      save: async (queue: ReturnType<typeof createSceneAssetQueue>) => {
        saves.push(queue.revision);
      },
    };
    let queue = createSceneAssetQueue(manifest, now);
    queue = await generateSceneAssetReferences(
      queue,
      {
        id: "fixture-sdxl",
        generate: async () => ({
          mimeType: "image/png",
          base64: "iVBORw==",
          artifactId: "reference:map-1:v1",
        }),
      },
      { store, now, onProgress: (event) => events.push(event) },
    );

    expect(queue.items[0]?.stage).toBe("needs_review");
    expect(queue.items[0]?.candidate?.providerId).toBe("fixture-sdxl");
    expect(() => promoteReadySceneAssets(manifest, queue).assetRegistry["map-1"]).not.toThrow();
    expect(promoteReadySceneAssets(manifest, queue).assetRegistry["map-1"]).toBeUndefined();

    queue = await reviewSceneAssetCandidate(queue, "map-1", "approved", { store, now });
    const reconstruct = vi.fn(async (_job, reference) => ({
      artifactId: `mesh:${reference.artifactId}`,
      asset: {
        key: "generated:document",
        geometry: "box" as const,
        dimensions: [0.92, 0.025, 0.64] as [number, number, number],
        color: "#d8bd80",
        modelUrl: "/generated/map-1-v1.glb",
      },
    }));
    queue = await reconstructApprovedSceneAssets(
      queue,
      { id: "fixture-triposr", source: "generated", reconstruct },
      { store, now, onProgress: (event) => events.push(event) },
    );
    expect(queue.items[0]?.stage).toBe("needs_asset_review");
    expect(promoteReadySceneAssets(manifest, queue).assetRegistry["map-1"]).toBeUndefined();
    queue = await reviewReconstructedSceneAsset(queue, "map-1", "approved", { store, now });
    const ready = promoteReadySceneAssets(manifest, queue);

    expect(reconstruct).toHaveBeenCalledOnce();
    expect(queue.items[0]?.stage).toBe("ready");
    expect(ready.status).toBe("ready");
    expect(ready.generationJobs).toEqual([]);
    expect(ready.assetRegistry["map-1"]?.modelUrl).toBe("/generated/map-1-v1.glb");
    expect(ready.resolvedAssets.at(-1)).toMatchObject({
      entityId: "map-1",
      registryKey: "map-1",
      source: "generated",
      catalogId: "mesh:reference:map-1:v1",
    });
    expect(events.map((event) => event.stage)).toEqual([
      "generating_reference",
      "needs_review",
      "reconstructing",
      "needs_asset_review",
    ]);
    expect(saves).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps rejected candidates out of reconstruction and supports a clean retry", async () => {
    const provider = {
      id: "fixture-sdxl",
      generate: vi.fn(async () => ({ mimeType: "image/png" as const, base64: "iVBORw==" })),
    };
    let queue = createSceneAssetQueue(pendingMapManifest(), now);
    queue = await generateSceneAssetReferences(queue, provider, { now });
    queue = await reviewSceneAssetCandidate(queue, "map-1", "rejected", {
      note: "cropped and unreadable",
      now,
    });
    const reconstruct = vi.fn();
    queue = await reconstructApprovedSceneAssets(
      queue,
      { id: "fixture-triposr", source: "generated", reconstruct },
      { now },
    );

    expect(reconstruct).not.toHaveBeenCalled();
    expect(queue.items[0]?.stage).toBe("rejected");
    expect(queue.items[0]?.review?.note).toBe("cropped and unreadable");

    queue = await retrySceneAsset(queue, "map-1", { now });
    expect(queue.items[0]).toMatchObject({ stage: "queued", referenceAttempts: 1 });
    expect(queue.items[0]?.candidate).toBeUndefined();
    expect(queue.items[0]?.review).toBeUndefined();
  });

  it("resumes a failed reconstruction from the approved reference", async () => {
    let queue = createSceneAssetQueue(pendingMapManifest(), now);
    queue = await generateSceneAssetReferences(
      queue,
      { id: "fixture-sdxl", generate: async () => ({ mimeType: "image/png", base64: "iVBORw==" }) },
      { now },
    );
    queue = await reviewSceneAssetCandidate(queue, "map-1", "approved", { now });
    queue = await reconstructApprovedSceneAssets(
      queue,
      {
        id: "offline-triposr",
        source: "generated",
        reconstruct: async () => {
          throw new Error("service offline");
        },
      },
      { now },
    );

    expect(queue.items[0]).toMatchObject({
      stage: "failed",
      failedPhase: "reconstruction",
      error: "service offline",
    });
    queue = await retrySceneAsset(queue, "map-1", { now });
    expect(queue.items[0]?.stage).toBe("approved");
    expect(queue.items[0]?.candidate?.base64).toBe("iVBORw==");
  });

  it("automatically rejects a structurally invalid image before human review", async () => {
    const manifest = pendingMapManifest();
    const queue = createSceneAssetQueue(manifest, now);
    const result = await advanceSceneAssetQueue(
      manifest,
      queue,
      {
        references: {
          id: "broken-image-provider",
          generate: async () => ({ mimeType: "image/png", base64: "iVBORw==" }),
        },
        reconstruction: {
          id: "fixture-triposr",
          source: "generated",
          reconstruct: vi.fn(),
        },
      },
      { validator: createReferenceImageIntegrityValidator(), now },
    );

    expect(result.queue.items[0]).toMatchObject({
      stage: "rejected",
      validation: {
        validatorId: "reference-image-integrity-v1",
        outcome: "reject",
      },
      review: {
        decision: "rejected",
        reviewer: "automated",
      },
    });
    expect(result.manifest.status).toBe("assets_pending");
    expect(result.manifest.assetRegistry["map-1"]).toBeUndefined();
  });

  it("routes planar jobs to a template provider instead of image-to-mesh", async () => {
    const mesh = vi.fn();
    const surface = vi.fn(async (job) => ({
      artifactId: "surface:map-1:v1",
      asset: {
        key: "generated-surface:document",
        geometry: "box" as const,
        dimensions: job.dimensions ?? [1, 1, 0.05],
        color: "#ffffff",
        surfaceTextureUrl: "/generated/map-1-v1.png",
      },
    }));
    const manifest = pendingMapManifest();
    let queue = createSceneAssetQueue(manifest, now);
    queue = await generateSceneAssetReferences(
      queue,
      { id: "fixture-sdxl", generate: async () => ({ mimeType: "image/png", base64: "iVBORw==" }) },
      { now },
    );
    queue = await reviewSceneAssetCandidate(queue, "map-1", "approved", { now });
    queue = await reconstructApprovedSceneAssets(
      queue,
      createSceneAssetReconstructionRouter({
        image_to_mesh: { id: "mesh", source: "generated", reconstruct: mesh },
        surface_template: { id: "surface", source: "generated", reconstruct: surface },
      }),
      { now },
    );

    expect(mesh).not.toHaveBeenCalled();
    expect(surface).toHaveBeenCalledOnce();
    expect(queue.items[0]?.stage).toBe("needs_asset_review");
    expect(queue.items[0]?.generated?.asset.surfaceTextureUrl).toBe("/generated/map-1-v1.png");
  });

  it("keeps a rejected reconstructed asset out of the registry and retries from its approved image", async () => {
    const manifest = pendingMapManifest();
    let queue = createSceneAssetQueue(manifest, now);
    queue = await generateSceneAssetReferences(
      queue,
      { id: "fixture-sdxl", generate: async () => ({ mimeType: "image/png", base64: "iVBORw==" }) },
      { now },
    );
    queue = await reviewSceneAssetCandidate(queue, "map-1", "approved", { now });
    queue = await reconstructApprovedSceneAssets(
      queue,
      {
        id: "fixture-surface",
        source: "generated",
        reconstruct: async (job) => ({
          artifactId: "bad-mesh:map-1",
          asset: {
            key: "generated:document",
            geometry: "box",
            dimensions: job.dimensions ?? [1, 1, 0.05],
            color: "#000000",
            modelUrl: "/generated/bad-map.glb",
          },
        }),
      },
      { now },
    );
    queue = await reviewReconstructedSceneAsset(queue, "map-1", "rejected", {
      note: "muddy materials in the world viewer",
      now,
    });

    expect(queue.items[0]).toMatchObject({
      stage: "rejected",
      assetReview: {
        decision: "rejected",
        note: "muddy materials in the world viewer",
      },
    });
    expect(promoteReadySceneAssets(manifest, queue).assetRegistry["map-1"]).toBeUndefined();

    queue = await retrySceneAsset(queue, "map-1", { now });
    expect(queue.items[0]?.stage).toBe("approved");
    expect(queue.items[0]?.candidate?.base64).toBe("iVBORw==");
    expect(queue.items[0]?.generated).toBeUndefined();
    expect(queue.items[0]?.assetReview).toBeUndefined();
  });
});
