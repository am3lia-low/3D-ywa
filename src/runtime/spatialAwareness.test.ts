import { describe, expect, it } from "vitest";
import patch2Fixture from "../../fixtures/patch_2.json";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch } from "./applyScenePatch";
import { createWorldLayout } from "./layoutEngine";
import {
  createVisibleRelationEdges,
  getEntitySpatialContext,
} from "./spatialAwareness";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const patch2 = patch2Fixture as unknown as ScenePatch;

describe("spatial awareness", () => {
  it("collects relation, provenance target and open-conflict context", () => {
    const context = getEntitySpatialContext(snapshot, "map-1");

    expect(context?.relations[0]?.sentence).toBe("Folded old map on Oak writing desk");
    expect(context?.relations[0]?.relatedEntity?.id).toBe("desk-1");
    expect(context?.conflicts.map((conflict) => conflict.id)).toEqual([
      "map-display-conflict",
    ]);
  });

  it("tracks relation changes across a scene patch", () => {
    const version2 = applyScenePatch(snapshot, patch2);
    const desk = getEntitySpatialContext(version2, "desk-1");

    expect(desk?.relations.some(({ relation }) => relation.id === "chair-near-desk")).toBe(false);
    expect(desk?.relations.some(({ relation }) => relation.id === "lantern-near-desk")).toBe(true);
  });

  it("creates edges only for visible, selected relations in the active room", () => {
    const attic = createWorldLayout(snapshot);
    const deskEdges = createVisibleRelationEdges(attic, snapshot.relations, "desk-1");
    const hearthEdges = createVisibleRelationEdges(attic, snapshot.relations, "hearth-1");

    expect(deskEdges.map((edge) => edge.relation.id).sort()).toEqual([
      "chair-near-desk",
      "map-on-desk",
    ]);
    expect(hearthEdges).toEqual([]);
  });
});
