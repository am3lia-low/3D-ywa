import { describe, expect, it } from "vitest";
import { BOOKS, SNAPSHOTS } from "../../Create UI Prototype for Hackathon/src/data/mockData";
import { buildMockSpatialScene } from "../../Create UI Prototype for Hackathon/src/spatial/mockSpatialAdapter";
import { compileSceneRecipe } from "../runtime/sceneRecipeCompiler";
import { createWorldLayout } from "../runtime/layoutEngine";

function relativeScaleSpread(
  target: readonly [number, number, number],
  source: readonly [number, number, number],
): number {
  const scales = target.map((value, index) => value / Math.max(source[index]!, 0.0001));
  return Math.max(...scales) / Math.max(Math.min(...scales), 0.0001);
}

describe("Member 3 prepared story scenes", () => {
  for (const book of BOOKS) {
    for (const chapter of book.chapters) {
      it(`${book.title} / ${chapter.title} is fully approved and spatially sane`, () => {
        const uiSnapshot = SNAPSHOTS[chapter.id]!;
        const scene = buildMockSpatialScene(book, chapter, uiSnapshot);
        const recipe = compileSceneRecipe(scene.spatialSnapshot, scene.visualPlan);
        const locationId = scene.spatialSnapshot.locations[0]!.id;
        const bounds = scene.spatialSnapshot.locations[0]!.bounds!;
        const layout = createWorldLayout(scene.spatialSnapshot, recipe.assetRegistry, [], locationId);

        expect(recipe.status).toBe("ready");
        expect(recipe.coverage.approvedPercent).toBe(100);
        expect(recipe.fallbackEntityIds).toEqual([]);
        expect(recipe.generationJobs).toEqual([]);

        for (const item of layout.items) {
          expect(Number.isFinite(item.position[0] + item.position[1] + item.position[2])).toBe(true);
          expect(Math.abs(item.position[0])).toBeLessThanOrEqual(bounds[0] / 2 + 0.01);
          expect(Math.abs(item.position[2])).toBeLessThanOrEqual(bounds[2] / 2 + 0.01);
          const asset = recipe.assetRegistry[item.entity.id]!;
          expect(relativeScaleSpread(item.dimensions, asset.dimensions)).toBeLessThanOrEqual(1.2);
        }

        const distortedDressing: string[] = [];
        for (const instance of recipe.locations[locationId]!.dressingInstances) {
          expect(instance.position[1] - instance.dimensions[1] / 2).toBeGreaterThanOrEqual(-0.01);
          if (instance.renderKind === "asset") {
            const spread = relativeScaleSpread(instance.dimensions, instance.asset.dimensions);
            if (spread > 1.2) distortedDressing.push(`${instance.dressingId} -> ${instance.asset.key} (${spread.toFixed(2)}x)`);
          }
        }
        expect(distortedDressing).toEqual([]);
      });
    }
  }
});
