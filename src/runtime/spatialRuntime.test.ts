import { describe, expect, it } from "vitest";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import {
  advanceSpatialRuntime,
  clearSpatialRuntimeExits,
  createSpatialRuntime,
} from "./spatialRuntime";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const patch2 = patch2Fixture as unknown as ScenePatch;
const patch3 = patch3Fixture as unknown as ScenePatch;

function itemById(state: ReturnType<typeof createSpatialRuntime>, entityId: string) {
  const item = state.layout.items.find((candidate) => candidate.entity.id === entityId);
  if (!item) throw new Error(`Missing layout item '${entityId}'.`);
  return item;
}

describe("spatial runtime continuity", () => {
  it("pins every existing item before placing a lexically earlier addition", () => {
    const initial = createSpatialRuntime(snapshot);
    const addition: ScenePatch = {
      fromVersion: 1,
      toVersion: 2,
      operations: [
        {
          op: "add_entity",
          entity: {
            id: "000-large-crate",
            name: "Newly discovered crate",
            kind: "container",
            locationId: "attic-study",
            dimensions: [2.2, 1.8, 2.2],
          },
        },
        {
          op: "add_relation",
          relation: {
            id: "crate-centered",
            subjectId: "000-large-crate",
            predicate: "centered",
          },
        },
      ],
    };

    const next = advanceSpatialRuntime(initial, addition);

    for (const previousItem of initial.layout.items) {
      const nextItem = itemById(next, previousItem.entity.id);
      expect(nextItem).toBe(previousItem);
      expect(nextItem.position).toBe(previousItem.position);
    }
    const crate = itemById(next, "000-large-crate");
    for (const existing of initial.layout.items) {
      const intersects =
        Math.abs(crate.position[0] - existing.position[0]) <
          (crate.dimensions[0] + existing.dimensions[0]) / 2 &&
        Math.abs(crate.position[1] - existing.position[1]) <
          (crate.dimensions[1] + existing.dimensions[1]) / 2 &&
        Math.abs(crate.position[2] - existing.position[2]) <
          (crate.dimensions[2] + existing.dimensions[2]) / 2;
      expect(intersects, `crate intersects ${existing.entity.id}`).toBe(false);
    }
  });

  it("repositions only an explicitly moved entity", () => {
    const initial = createSpatialRuntime(snapshot);
    const move: ScenePatch = {
      fromVersion: 1,
      toVersion: 2,
      operations: [
        {
          op: "move_entity",
          entityId: "chair-1",
          position: [3.8, 0.55, 2.8],
        },
      ],
    };

    const next = advanceSpatialRuntime(initial, move);

    expect(itemById(next, "chair-1").position).not.toEqual(itemById(initial, "chair-1").position);
    for (const entityId of ["desk-1", "hearth-1", "map-1", "rug-1"]) {
      expect(itemById(next, entityId)).toBe(itemById(initial, entityId));
    }
  });

  it("retains removed nodes as temporary exit state without disturbing survivors", () => {
    const initial = createSpatialRuntime(snapshot);
    const removal: ScenePatch = {
      fromVersion: 1,
      toVersion: 2,
      operations: [{ op: "remove_entity", entityId: "rug-1" }],
    };

    const next = advanceSpatialRuntime(initial, removal);

    expect(next.layout.items.some((item) => item.entity.id === "rug-1")).toBe(false);
    expect(next.exitingItems).toEqual([itemById(initial, "rug-1")]);
    expect(itemById(next, "desk-1")).toBe(itemById(initial, "desk-1"));
    expect(clearSpatialRuntimeExits(next).exitingItems).toEqual([]);
  });

  it("preserves all unaffected coordinates through the three-passage fixtures", () => {
    const version1 = createSpatialRuntime(snapshot);
    const version2 = advanceSpatialRuntime(version1, patch2);
    const version3 = advanceSpatialRuntime(version2, patch3);

    for (const entityId of ["hearth-1", "map-1", "rug-1"]) {
      expect(itemById(version2, entityId).position).toBe(itemById(version1, entityId).position);
    }
    for (const entityId of ["chair-1", "desk-1", "map-1", "rug-1"]) {
      expect(itemById(version3, entityId).position).toBe(itemById(version2, entityId).position);
    }
  });
});
