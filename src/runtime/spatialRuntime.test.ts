import { describe, expect, it } from "vitest";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import {
  advanceSpatialRuntime,
  clearSpatialRuntimeExits,
  createSpatialRuntime,
  refreshSpatialRuntimeAssets,
  SpatialLocationError,
  switchSpatialRuntimeLocation,
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
  it("refreshes visual assets without rewinding snapshot state or moving entities", () => {
    const version2 = advanceSpatialRuntime(createSpatialRuntime(snapshot), patch2);
    const previousChair = itemById(version2, "chair-1");
    const refreshed = refreshSpatialRuntimeAssets(version2, {
      chair: { ...previousChair.asset, color: "#ffffff" },
    });

    expect(refreshed.snapshot).toBe(version2.snapshot);
    expect(refreshed.snapshot.version).toBe(2);
    expect(itemById(refreshed, "chair-1").position).toBe(previousChair.position);
    expect(itemById(refreshed, "chair-1").asset.color).toBe("#ffffff");
  });

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

  it("keeps an on-relation attached when its supporting entity moves", () => {
    const initial = createSpatialRuntime(snapshot);
    const moveDesk: ScenePatch = {
      fromVersion: 1,
      toVersion: 2,
      operations: [
        {
          op: "move_entity",
          entityId: "desk-1",
          position: [-2.4, 0.6, 1.8],
        },
      ],
    };

    const next = advanceSpatialRuntime(initial, moveDesk);
    const desk = itemById(next, "desk-1");
    const map = itemById(next, "map-1");

    expect(map.position[0]).toBe(desk.position[0]);
    expect(map.position[2]).toBe(desk.position[2]);
    expect(map.position[1]).toBeCloseTo(
      desk.position[1] + desk.dimensions[1] / 2 + map.dimensions[1] / 2 + 0.008,
    );
    expect(map.position).not.toEqual(itemById(initial, "map-1").position);
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

    const hearth = itemById(version3, "hearth-1");
    const hiddenDoor = itemById(version3, "hidden-door-1");
    expect(Math.abs(hiddenDoor.position[0] - hearth.position[0])).toBeGreaterThanOrEqual(
      (hiddenDoor.dimensions[0] + hearth.dimensions[0]) / 2,
    );
  });

  it("switches rooms without rolling back the patched world version", () => {
    const version2 = advanceSpatialRuntime(createSpatialRuntime(snapshot), patch2);
    const archive = switchSpatialRuntimeLocation(version2, "archive-vault");
    const atticAgain = switchSpatialRuntimeLocation(archive, "attic-study");

    expect(archive.snapshot.version).toBe(2);
    expect(archive.layout.location.id).toBe("archive-vault");
    expect(archive.layout.items.map((item) => item.entity.id).sort()).toEqual([
      "archive-chair-1",
      "archive-desk-1",
      "archive-rug-1",
    ]);
    expect(atticAgain.snapshot.version).toBe(2);
    expect(itemById(atticAgain, "lantern-1")).toBeDefined();
  });

  it("animates an entity out when a patch moves it into another room", () => {
    const initial = createSpatialRuntime(snapshot);
    const relocation: ScenePatch = {
      fromVersion: 1,
      toVersion: 2,
      operations: [
        {
          op: "move_entity",
          entityId: "chair-1",
          locationId: "archive-vault",
          position: [2, 0.55, 1],
        },
      ],
    };

    const next = advanceSpatialRuntime(initial, relocation);
    expect(next.layout.items.some((item) => item.entity.id === "chair-1")).toBe(false);
    expect(next.exitingItems.map((item) => item.entity.id)).toContain("chair-1");

    const archive = switchSpatialRuntimeLocation(next, "archive-vault");
    expect(itemById(archive, "chair-1").position).toEqual([2, 0.775, 1]);
  });

  it("rejects unknown room IDs without changing the mounted runtime", () => {
    const initial = createSpatialRuntime(snapshot);
    expect(() => switchSpatialRuntimeLocation(initial, "missing-room")).toThrow(
      SpatialLocationError,
    );
    expect(initial.layout.location.id).toBe("attic-study");
  });
});
