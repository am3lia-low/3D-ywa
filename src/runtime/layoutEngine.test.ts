import { describe, expect, it } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import courtyardSnapshotFixture from "../../fixtures/snapshot_courtyard_1.json";
import courtyardPatchFixture from "../../fixtures/patch_courtyard_2.json";
import woodlandSnapshotFixture from "../../fixtures/snapshot_woodland_1.json";
import atticPatch2Fixture from "../../fixtures/patch_2.json";
import atticPatch3Fixture from "../../fixtures/patch_3.json";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch } from "./applyScenePatch";
import { createWorldLayout } from "./layoutEngine";

const snapshot = snapshotFixture as unknown as WorldSnapshot;

describe("createWorldLayout", () => {
  it("returns identical positions for identical world state", () => {
    const first = createWorldLayout(snapshot);
    const second = createWorldLayout(snapshot);

    expect(first.items.map(({ entity, position }) => [entity.id, position])).toEqual(
      second.items.map(({ entity, position }) => [entity.id, position]),
    );
  });

  it("resolves semantic placement and unknown-asset fallbacks", () => {
    const layout = createWorldLayout(snapshot);
    const desk = layout.items.find((item) => item.entity.id === "desk-1");
    const chair = layout.items.find((item) => item.entity.id === "chair-1");
    const map = layout.items.find((item) => item.entity.id === "map-1");

    expect(desk).toBeDefined();
    expect(chair?.position[2]).toBeGreaterThan(desk?.position[2] ?? 0);
    expect(chair?.dimensions[1]).toBeGreaterThan(desk?.dimensions[1] ?? 0);
    expect(Math.abs((chair?.rotation[1] ?? 0) - Math.PI)).toBeLessThan(0.001);
    expect(map?.position[1]).toBeGreaterThan(desk?.position[1] ?? 0);
    expect(
      (map?.position[1] ?? 0) - (map?.dimensions[1] ?? 0) / 2,
    ).toBeCloseTo(
      (desk?.position[1] ?? 0) + (desk?.dimensions[1] ?? 0) / 2 + 0.008,
      4,
    );
    expect(map?.asset.key).toBe("map");
  });

  it("keeps every object's footprint inside the room bounds", () => {
    const layout = createWorldLayout(snapshot);
    const bounds = layout.location.bounds ?? [12, 4.5, 10];

    for (const item of layout.items) {
      expect(Math.abs(item.position[0]) + item.dimensions[0] / 2).toBeLessThanOrEqual(
        bounds[0] / 2,
      );
      expect(Math.abs(item.position[2]) + item.dimensions[2] / 2).toBeLessThanOrEqual(
        bounds[2] / 2,
      );
      expect(item.position[1] - item.dimensions[1] / 2).toBeGreaterThanOrEqual(0);
    }
  });

  it("locks explicit architectural coordinates to their declared wall", () => {
    const version2 = applyScenePatch(snapshot, atticPatch2Fixture as unknown as ScenePatch);
    const version3 = applyScenePatch(version2, atticPatch3Fixture as unknown as ScenePatch);
    const layout = createWorldLayout(version3);
    const door = layout.items.find((item) => item.entity.id === "hidden-door-1")!;
    const bounds = layout.location.bounds!;

    expect(door.position[0]).toBeCloseTo(7.5);
    expect(door.position[2]).toBeCloseTo(-bounds[2] / 2 + door.dimensions[2] / 2 + 0.18);
  });

  it("lays out only entities belonging to the requested location", () => {
    const archive = createWorldLayout(snapshot, undefined, [], "archive-vault");

    expect(archive.location.id).toBe("archive-vault");
    expect(archive.items.map((item) => item.entity.id).sort()).toEqual([
      "archive-chair-1",
      "archive-desk-1",
      "archive-rug-1",
    ]);
    expect(archive.items.every((item) => item.entity.locationId === "archive-vault")).toBe(true);
  });

  it("composes related props into stable semantic slots on a tabletop", () => {
    const opening = courtyardSnapshotFixture as unknown as WorldSnapshot;
    const departure = applyScenePatch(
      opening,
      courtyardPatchFixture as unknown as ScenePatch,
    );
    const layout = createWorldLayout(departure);
    const table = layout.items.find((item) => item.entity.id === "courtyard-table-1")!;
    const parcel = layout.items.find((item) => item.entity.id === "courtyard-parcel-1")!;
    const lantern = layout.items.find((item) => item.entity.id === "courtyard-lantern-1")!;
    const map = layout.items.find((item) => item.entity.id === "courtyard-map-1")!;

    for (const prop of [parcel, lantern, map]) {
      expect(prop.position[1] - prop.dimensions[1] / 2).toBeCloseTo(
        table.position[1] + table.dimensions[1] / 2 + 0.008,
        4,
      );
      expect(Math.abs(prop.position[0] - table.position[0]) + prop.dimensions[0] / 2)
        .toBeLessThan(table.dimensions[0] / 2);
      expect(Math.abs(prop.position[2] - table.position[2]) + prop.dimensions[2] / 2)
        .toBeLessThan(table.dimensions[2] / 2);
    }

    expect(parcel.position[0]).toBeLessThan(table.position[0]);
    expect(lantern.position[0]).toBeGreaterThan(table.position[0]);
    expect(map.position[2]).toBeGreaterThan(table.position[2]);
  });

  it("keeps the moved courtyard chair facing the gate", () => {
    const departure = applyScenePatch(
      courtyardSnapshotFixture as unknown as WorldSnapshot,
      courtyardPatchFixture as unknown as ScenePatch,
    );
    const layout = createWorldLayout(departure);
    const chair = layout.items.find((item) => item.entity.id === "courtyard-chair-1")!;
    const gate = layout.items.find((item) => item.entity.id === "courtyard-gate-1")!;
    const directionX = gate.position[0] - chair.position[0];
    const directionZ = gate.position[2] - chair.position[2];
    const length = Math.hypot(directionX, directionZ);
    const alignment =
      (Math.sin(chair.rotation[1]) * directionX + Math.cos(chair.rotation[1]) * directionZ) /
      length;

    expect(alignment).toBeGreaterThan(0.99);
  });

  it("uses the visual safe zone when a prop rests on an irregular support", () => {
    const layout = createWorldLayout(woodlandSnapshotFixture as unknown as WorldSnapshot);
    const log = layout.items.find((item) => item.entity.id === "fallen-cedar-1")!;
    const lantern = layout.items.find((item) => item.entity.id === "trail-lantern-1")!;

    expect(lantern.position[0]).toBeCloseTo(log.position[0], 4);
    expect(lantern.position[2]).toBeCloseTo(log.position[2], 4);
    expect(lantern.position[1] - lantern.dimensions[1] / 2).toBeCloseTo(
      log.position[1] + log.dimensions[1] / 2 + 0.008,
      4,
    );
  });
});
