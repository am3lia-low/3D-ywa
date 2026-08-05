import { describe, expect, it } from "vitest";

import snapshotFixture from "../../fixtures/snapshot_1.json";
import visualPlanFixture from "../../fixtures/visual_scene_plan_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import { defaultAssetRegistry } from "./assetRegistry";
import {
  buildRegenerationManifest,
  createInlineSurfaceTemplateProvider,
  INLINE_SURFACE_REFERENCE_URL,
  materializeInlineSurfaceAsset,
} from "./assetReviewSession";

const snapshot = snapshotFixture as WorldSnapshot;
const plan = visualPlanFixture as VisualScenePlan;

describe("asset review session", () => {
  it("isolates one canonical entity for regeneration without removing other assets", () => {
    const manifest = buildRegenerationManifest(snapshot, plan, "map-1", defaultAssetRegistry);

    expect(manifest.generationJobs).toHaveLength(1);
    expect(manifest.generationJobs[0]).toMatchObject({
      entityId: "map-1",
      strategy: "surface_template",
    });
    expect(manifest.assetRegistry["map-1"]).toBeUndefined();
    expect(manifest.assetRegistry.desk).toBeDefined();
  });

  it("turns an approved surface reference into a browser-previewable asset", async () => {
    const manifest = buildRegenerationManifest(snapshot, plan, "map-1", defaultAssetRegistry);
    const artifact = await createInlineSurfaceTemplateProvider().reconstruct(
      manifest.generationJobs[0]!,
      {
        mimeType: "image/png",
        base64: "iVBORw==",
      },
    );

    expect(artifact.asset.surfaceTextureUrl).toBe(INLINE_SURFACE_REFERENCE_URL);
    expect(materializeInlineSurfaceAsset(artifact.asset, {
      mimeType: "image/png",
      base64: "iVBORw==",
    }).surfaceTextureUrl).toBe("data:image/png;base64,iVBORw==");
    expect(artifact.asset.geometry).toBe("box");
  });
});
