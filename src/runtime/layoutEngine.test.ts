import { describe, expect, it } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import type { WorldSnapshot } from "../contracts/world";
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
    expect(map?.position[1]).toBeGreaterThan(desk?.position[1] ?? 0);
    expect(map?.asset.key).toBe("fallback:document");
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
});
