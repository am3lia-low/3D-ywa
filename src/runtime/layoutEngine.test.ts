import { describe, expect, it } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import courtyardSnapshotFixture from "../../fixtures/snapshot_courtyard_1.json";
import courtyardPatchFixture from "../../fixtures/patch_courtyard_2.json";
import woodlandSnapshotFixture from "../../fixtures/snapshot_woodland_1.json";
import conservatorySnapshotFixture from "../../fixtures/snapshot_conservatory_1.json";
import conservatoryPlanFixture from "../../fixtures/visual_scene_plan_conservatory_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import atticPatch2Fixture from "../../fixtures/patch_2.json";
import atticPatch3Fixture from "../../fixtures/patch_3.json";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch } from "./applyScenePatch";
import { createWorldLayout, supportSurfaceWorldY } from "./layoutEngine";
import { compileSceneRecipe } from "./sceneRecipeCompiler";

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
    expect(door.position[2]).toBeCloseTo(-bounds[2] / 2 + door.dimensions[2] / 2 + 0.018);
  });

  it("turns wall assets to sit flush against east and west walls", () => {
    const wallSnapshot: WorldSnapshot = {
      storyId: "wall-orientation-test",
      version: 1,
      passageId: "P1",
      locations: [{ id: "hall", name: "Hall", bounds: [12, 5, 10] }],
      entities: [
        { id: "west-door", name: "West door", kind: "architecture", locationId: "hall", assetKey: "door" },
        { id: "east-window", name: "East window", kind: "architecture", locationId: "hall", dimensions: [1.8, 1.4, 0.16] },
      ],
      relations: [
        { id: "west-door-wall", subjectId: "west-door", predicate: "against_wall", metadata: { wall: "west" } },
        { id: "east-window-wall", subjectId: "east-window", predicate: "against_wall", metadata: { wall: "east" } },
      ],
      conflicts: [],
    };
    const layout = createWorldLayout(wallSnapshot);

    expect(layout.items.find((item) => item.entity.id === "west-door")?.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(layout.items.find((item) => item.entity.id === "east-window")?.rotation[1]).toBeCloseTo(Math.PI / 2);
    const westDoor = layout.items.find((item) => item.entity.id === "west-door")!;
    const eastWindow = layout.items.find((item) => item.entity.id === "east-window")!;
    expect(westDoor.position[0] - westDoor.dimensions[2] / 2).toBeCloseTo(-6 + 0.018);
    expect(eastWindow.position[0] + eastWindow.dimensions[2] / 2).toBeCloseTo(6 - 0.018);
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

  it("keeps multiple large props on their shared support instead of moving one off it", () => {
    const crowdedSurface: WorldSnapshot = {
      storyId: "crowded-surface-test",
      version: 1,
      passageId: "P1",
      locations: [{ id: "workroom", name: "Workroom", bounds: [18, 6, 18] }],
      entities: [
        { id: "workbench", name: "Work bench", kind: "furniture", locationId: "workroom", assetKey: "desk" },
        { id: "large-chart", name: "Large chart", kind: "document", locationId: "workroom", assetKey: "map", dimensions: [1.18, 0.025, 0.78] },
        { id: "signal-lamp", name: "Signal lamp", kind: "light", locationId: "workroom", assetKey: "lantern" },
      ],
      relations: [
        { id: "chart-on-bench", subjectId: "large-chart", predicate: "on", objectId: "workbench" },
        { id: "lamp-on-bench", subjectId: "signal-lamp", predicate: "on", objectId: "workbench" },
      ],
      conflicts: [],
    };
    const layout = createWorldLayout(crowdedSurface);
    const table = layout.items.find((item) => item.entity.id === "workbench")!;
    const chart = layout.items.find((item) => item.entity.id === "large-chart")!;
    const lamp = layout.items.find((item) => item.entity.id === "signal-lamp")!;

    for (const prop of [chart, lamp]) {
      expect(prop.position[1] - prop.dimensions[1] / 2).toBeCloseTo(
        supportSurfaceWorldY(table) + 0.008,
        4,
      );
      expect(Math.abs(prop.position[0] - table.position[0]) + prop.dimensions[0] / 2)
        .toBeLessThan(table.dimensions[0] / 2);
      expect(Math.abs(prop.position[2] - table.position[2]) + prop.dimensions[2] / 2)
        .toBeLessThan(table.dimensions[2] / 2);
    }

    const separatedAlongX = Math.abs(chart.position[0] - lamp.position[0]) >=
      (chart.dimensions[0] + lamp.dimensions[0]) / 2 + 0.025;
    const separatedAlongZ = Math.abs(chart.position[2] - lamp.position[2]) >=
      (chart.dimensions[2] + lamp.dimensions[2]) / 2 + 0.025;
    expect(separatedAlongX || separatedAlongZ).toBe(true);
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

  it("keeps furniture beside wall architecture clear of the wall and honors explicit room-facing evidence", () => {
    const hallSnapshot: WorldSnapshot = {
      storyId: "wall-furniture-clearance",
      version: 1,
      passageId: "P1",
      locations: [{ id: "hall", name: "Hall", bounds: [18, 6, 16] }],
      entities: [
        {
          id: "hearth",
          name: "Stone hearth",
          kind: "architecture",
          locationId: "hall",
          assetKey: "fireplace",
          dimensions: [3.8, 3.35, 1.05],
        },
        {
          id: "armchair",
          name: "Red armchair",
          kind: "furniture",
          locationId: "hall",
          assetKey: "victorian-armchair",
          dimensions: [1.15, 1.45, 1.04],
          provenance: {
            passageId: "P1",
            confidence: 0.98,
            sentence: "A red armchair stood beside the fireplace, angled toward the room rather than the hearth.",
          },
        },
      ],
      relations: [
        { id: "hearth-wall", subjectId: "hearth", predicate: "against_wall", metadata: { wall: "north" } },
        { id: "chair-near-hearth", subjectId: "armchair", predicate: "near", objectId: "hearth", distance: 0.42 },
      ],
      conflicts: [],
    };
    const layout = createWorldLayout(hallSnapshot);
    const hearth = layout.items.find((item) => item.entity.id === "hearth")!;
    const chair = layout.items.find((item) => item.entity.id === "armchair")!;

    expect(chair.position[2] - chair.dimensions[2] / 2).toBeGreaterThan(
      hearth.position[2] + hearth.dimensions[2] / 2 + 0.6,
    );
    const toRoomX = -chair.position[0];
    const toRoomZ = -chair.position[2];
    const alignment = (
      Math.sin(chair.rotation[1]) * toRoomX + Math.cos(chair.rotation[1]) * toRoomZ
    ) / Math.hypot(toRoomX, toRoomZ);
    expect(alignment).toBeGreaterThan(0.99);
  });

  it("uses the visual safe zone when a prop rests on an irregular support", () => {
    const layout = createWorldLayout(woodlandSnapshotFixture as unknown as WorldSnapshot);
    const log = layout.items.find((item) => item.entity.id === "fallen-cedar-1")!;
    const lantern = layout.items.find((item) => item.entity.id === "trail-lantern-1")!;

    expect(lantern.position[0]).toBeCloseTo(log.position[0], 4);
    expect(lantern.position[2]).toBeCloseTo(log.position[2], 4);
    expect(lantern.position[1] - lantern.dimensions[1] / 2).toBeCloseTo(
      supportSurfaceWorldY(log) + 0.008,
      4,
    );
  });

  it("places unconstrained support furniture before its dependent props", () => {
    const conservatory = conservatorySnapshotFixture as unknown as WorldSnapshot;
    const registry = compileSceneRecipe(
      conservatory,
      conservatoryPlanFixture as unknown as VisualScenePlan,
    ).assetRegistry;
    const layout = createWorldLayout(conservatory, registry);
    const table = layout.items.find((item) => item.entity.id === "conservatory-worktable-1")!;
    const orrery = layout.items.find((item) => item.entity.id === "orrery-1")!;

    expect(orrery.position[1] - orrery.dimensions[1] / 2).toBeCloseTo(
      table.position[1] + table.dimensions[1] / 2 + 0.008,
      4,
    );
    expect(Math.abs(orrery.position[0] - table.position[0]) + orrery.dimensions[0] / 2)
      .toBeLessThan(table.dimensions[0] / 2);
    expect(Math.abs(orrery.position[2] - table.position[2]) + orrery.dimensions[2] / 2)
      .toBeLessThan(table.dimensions[2] / 2);
  });
});
