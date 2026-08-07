import { describe, expect, it } from "vitest";
import { BOOKS, SNAPSHOTS } from "../../Create UI Prototype for Hackathon/src/data/mockData";
import { buildMockSpatialScene } from "../../Create UI Prototype for Hackathon/src/spatial/mockSpatialAdapter";
import { compileSceneRecipe } from "../runtime/sceneRecipeCompiler";

describe("Amber Archive visual composition", () => {
  it("grounds its furniture and supports its reading-table props", () => {
    const book = BOOKS.find((candidate) => candidate.id === "book-amber")!;
    const chapter = book.chapters[0]!;
    const scene = buildMockSpatialScene(book, chapter, SNAPSHOTS[chapter.id]!);
    const recipe = compileSceneRecipe(scene.spatialSnapshot, scene.visualPlan);
    const location = recipe.locations[scene.spatialSnapshot.locations[0]!.id]!;

    const bySlot = new Map(location.dressingInstances.map((instance) => [
      instance.dressingId.split(":").at(-1)!,
      instance,
    ]));
    expect(recipe.styleKit.id).toBe("storybook-historical");
    expect([...bySlot.keys()].filter((slot) => slot === "archive-reading-chair")).toHaveLength(1);
    expect([...bySlot.keys()].filter((slot) => slot === "archive-reading-table")).toHaveLength(1);
    expect(bySlot.has("archive-cataloguing-table")).toBe(true);
    expect(bySlot.has("archive-cataloguing-chair")).toBe(true);
    expect(bySlot.has("archive-south-display-cabinet")).toBe(true);
    expect(bySlot.has("archive-south-longcase-clock")).toBe(true);
    expect(bySlot.has("reading-side-table")).toBe(true);
    expect(bySlot.has("reading-table-lamp")).toBe(true);
    expect(bySlot.has("west-floor-lamp")).toBe(false);
    expect(bySlot.has("east-floor-lamp")).toBe(false);

    for (const instance of location.dressingInstances.filter((candidate) => candidate.placementAnchor === "floor")) {
      expect(
        instance.position[1] - instance.dimensions[1] / 2,
        `${instance.dressingId} must touch the floor`,
      ).toBeCloseTo(0, 5);
    }

    for (const slot of ["archive-table-books", "archive-table-ledger", "archive-table-lamp"]) {
      const instance = bySlot.get(slot)!;
      expect(instance.placementAnchor).toBe("surface");
      expect(instance.supportId).toContain("archive-reading-table");
      expect(instance.position[1] - instance.dimensions[1] / 2).toBeGreaterThanOrEqual(1.15);
    }
    const readingTable = bySlot.get("archive-reading-table")!;
    const tableLamp = bySlot.get("archive-table-lamp")!;
    expect(tableLamp.position[1] - tableLamp.dimensions[1] / 2)
      .toBeCloseTo(readingTable.position[1] + readingTable.dimensions[1] / 2 - 0.037, 5);
    expect(Math.abs(tableLamp.position[0] - readingTable.position[0]))
      .toBeLessThan(readingTable.dimensions[0] / 2);
    expect(Math.abs(tableLamp.position[2] - readingTable.position[2]))
      .toBeLessThan(readingTable.dimensions[2] / 2);
    const cataloguingVase = bySlot.get("archive-cataloguing-vase")!;
    expect(cataloguingVase.placementAnchor).toBe("surface");
    expect(cataloguingVase.supportId).toContain("archive-cataloguing-table");
    const sideTable = bySlot.get("reading-side-table")!;
    const smallLamp = bySlot.get("reading-table-lamp")!;
    expect(smallLamp.supportId).toContain("reading-side-table");
    expect(smallLamp.position[1] - smallLamp.dimensions[1] / 2)
      .toBeCloseTo(sideTable.position[1] + sideTable.dimensions[1] / 2 + 0.008, 5);
  });
});
