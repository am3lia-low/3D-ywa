import { describe, expect, it } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import plan1Fixture from "../../fixtures/visual_scene_plan_1.json";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import plan3Fixture from "../../fixtures/visual_scene_plan_3.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch } from "./applyScenePatch";
import { compileScenePresentation, ScenePlanError } from "./sceneCompiler";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const plan1 = plan1Fixture as unknown as VisualScenePlan;

describe("compileScenePresentation", () => {
  it("turns semantic attic context into renderer features", () => {
    const scene = compileScenePresentation(plan1, snapshot, "attic-study");

    expect(scene.styleLabel).toBe("hand-painted storybook realism");
    expect(scene.architecture).toMatchObject({
      floorboards: true,
      plasterWalls: true,
      timberFrame: true,
      window: true,
      archiveShelves: false,
    });
    expect(scene.dressing).toMatchObject({ books: true, storageCrates: true, travelChest: true });
    expect(scene.atmosphere.dust).toBe(true);
  });

  it("compiles a distinct archive treatment from the same plan", () => {
    const scene = compileScenePresentation(plan1, snapshot, "archive-vault");
    expect(scene.architecture.archiveShelves).toBe(true);
    expect(scene.architecture.floorboards).toBe(false);
    expect(scene.palette.background).toBe("#111a1b");
  });

  it("emits an asset request for a supporting object without a registered asset key", () => {
    const scene = compileScenePresentation(plan1, snapshot, "attic-study");
    expect(scene.assetRequests.map((request) => request.entityId)).toContain("map-1");
  });

  it("rejects non-canonical visual identities", () => {
    const firstEntity = plan1.entities[0];
    if (!firstEntity) throw new Error("Fixture must contain a visual entity.");
    const invalid = {
      ...plan1,
      entities: [{ ...firstEntity, entityId: "invented-desk" }],
    };
    expect(() => compileScenePresentation(invalid, snapshot, "attic-study")).toThrow(
      ScenePlanError,
    );
  });

  it("unlocks the presentation-only portal only after the revealed plan version", () => {
    const version2 = applyScenePatch(snapshot, patch2Fixture as unknown as ScenePatch);
    const version3 = applyScenePatch(version2, patch3Fixture as unknown as ScenePatch);
    const scene = compileScenePresentation(
      plan3Fixture as unknown as VisualScenePlan,
      version3,
      "attic-study",
    );
    expect(scene.portalTargetLocationId).toBe("archive-vault");
  });
});
