import { describe, expect, it } from "vitest";

import courtyardSnapshotFixture from "../../fixtures/snapshot_courtyard_1.json";
import courtyardPlanFixture from "../../fixtures/visual_scene_plan_courtyard_1.json";
import woodlandSnapshotFixture from "../../fixtures/snapshot_woodland_1.json";
import woodlandPlanFixture from "../../fixtures/visual_scene_plan_woodland_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import { compileSceneRecipe } from "./sceneRecipeCompiler";

const snapshot = courtyardSnapshotFixture as unknown as WorldSnapshot;
const plan = courtyardPlanFixture as unknown as VisualScenePlan;

describe("scene composition audit", () => {
  it("passes a deterministic composed scene with clear access and supported props", () => {
    const audit = compileSceneRecipe(snapshot, plan).composition;

    expect(audit).toMatchObject({ status: "clean", score: 100, errorCount: 0, warningCount: 0 });
    expect(audit.locations["coaching-courtyard"]?.entityCount).toBe(5);
  });

  it("blocks implausible scale before it can be promoted", () => {
    const oversized: WorldSnapshot = {
      ...snapshot,
      entities: snapshot.entities.map((entity) =>
        entity.id === "courtyard-parcel-1"
          ? { ...entity, dimensions: [30, 6.4, 25] }
          : entity,
      ),
    };
    const audit = compileSceneRecipe(oversized, plan).composition;

    expect(audit.status).toBe("blocking");
    expect(audit.locations["coaching-courtyard"]?.issues.map((candidate) => candidate.code))
      .toContain("implausible_scale");
  });

  it("flags furniture that explicitly faces away from its related object", () => {
    const backward: WorldSnapshot = {
      ...snapshot,
      entities: snapshot.entities.map((entity) =>
        entity.id === "courtyard-chair-1"
          ? { ...entity, transform: { rotation: [0, 0, 0] } }
          : entity,
      ),
    };
    const audit = compileSceneRecipe(backward, plan).composition;

    expect(audit.status).toBe("review");
    expect(audit.locations["coaching-courtyard"]?.issues.map((candidate) => candidate.code))
      .toContain("facing_mismatch");
  });

  it("detects furniture placed across a door's access zone", () => {
    const blocked: WorldSnapshot = {
      ...snapshot,
      entities: snapshot.entities.map((entity) =>
        entity.id === "courtyard-table-1"
          ? { ...entity, transform: { position: [0, 0.6, -12] } }
          : entity,
      ),
    };
    const audit = compileSceneRecipe(blocked, plan).composition;

    expect(audit.status).toBe("blocking");
    expect(audit.locations["coaching-courtyard"]?.issues.map((candidate) => candidate.code))
      .toContain("blocked_access");
  });

  it("blocks an on-relation whose subject misses its support surface", () => {
    const woodlandSnapshot = woodlandSnapshotFixture as unknown as WorldSnapshot;
    const misplaced: WorldSnapshot = {
      ...woodlandSnapshot,
      entities: woodlandSnapshot.entities.map((entity) =>
        entity.id === "trail-lantern-1"
          ? { ...entity, transform: { position: [0, 0.43, 0] } }
          : entity,
      ),
    };
    const audit = compileSceneRecipe(
      misplaced,
      woodlandPlanFixture as unknown as VisualScenePlan,
    ).composition;

    expect(audit.status).toBe("blocking");
    expect(audit.locations["mosswood-path"]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "broken_surface_relation",
          entityIds: ["trail-lantern-1", "fallen-cedar-1"],
        }),
      ]),
    );
  });
});
