import { describe, expect, it } from "vitest";
import { BOOKS, SNAPSHOTS } from "../../Create UI Prototype for Hackathon/src/data/mockData";
import { buildMockSpatialScene } from "../../Create UI Prototype for Hackathon/src/spatial/mockSpatialAdapter";
import { compileSceneRecipe } from "../runtime/sceneRecipeCompiler";
import { createWorldLayout } from "../runtime/layoutEngine";
import { URBAN_HUMAN_SCALE } from "../runtime/urbanComposition";
import { WALL_COMPOSITION } from "../runtime/wallComposition";

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

        if (scene.spatialSnapshot.entities.some((entity) => entity.id === "armchair")) {
          expect(recipe.assetRegistry.armchair?.key).toBe("victorian-armchair");
          expect(layout.items.find((item) => item.entity.id === "armchair")?.dimensions[1]).toBeGreaterThanOrEqual(1.4);
        }

        for (const item of layout.items) {
          expect(Number.isFinite(item.position[0] + item.position[1] + item.position[2])).toBe(true);
          expect(Math.abs(item.position[0])).toBeLessThanOrEqual(bounds[0] / 2 + 0.01);
          expect(Math.abs(item.position[2])).toBeLessThanOrEqual(bounds[2] / 2 + 0.01);
          const asset = recipe.assetRegistry[item.entity.id]!;
          expect(relativeScaleSpread(item.dimensions, asset.dimensions)).toBeLessThanOrEqual(1.2);
        }

        for (const relation of scene.spatialSnapshot.relations.filter((candidate) => candidate.predicate === "against_wall")) {
          const item = layout.items.find((candidate) => candidate.entity.id === relation.subjectId)!;
          const wall = relation.metadata?.wall ?? "north";
          const normalEdge = wall === "north"
            ? item.position[2] - item.dimensions[2] / 2
            : wall === "south"
              ? item.position[2] + item.dimensions[2] / 2
              : wall === "east"
                ? item.position[0] + item.dimensions[2] / 2
                : item.position[0] - item.dimensions[2] / 2;
          const boundary = wall === "north"
            ? -bounds[2] / 2
            : wall === "south"
              ? bounds[2] / 2
              : wall === "east"
                ? bounds[0] / 2
                : -bounds[0] / 2;
          expect(Math.abs(normalEdge - boundary), `${item.entity.id} must sit flush on ${wall}`).toBeLessThan(0.03);
        }

        const canal = layout.items.find((item) => item.asset.proceduralModel === "canal");
        if (canal) {
          expect(Math.abs(canal.position[0])).toBeLessThan(0.01);
          expect(Math.abs(canal.position[2])).toBeLessThan(0.01);
          expect(canal.dimensions[2] / bounds[2]).toBeGreaterThanOrEqual(URBAN_HUMAN_SCALE.canalCoverageRatio);
          expect(URBAN_HUMAN_SCALE.minimumBuildingHeight).toBeGreaterThan(URBAN_HUMAN_SCALE.doorHeight * 3);
          expect(URBAN_HUMAN_SCALE.doorHeight).toBeGreaterThanOrEqual(2.1);
          expect(URBAN_HUMAN_SCALE.stallCanopyHeight).toBeGreaterThanOrEqual(2.3);
          const facadeInnerEdge = bounds[0] / 2 - URBAN_HUMAN_SCALE.facadeMaximumDepth;
          for (const instance of recipe.locations[locationId]!.dressingInstances) {
            const cosine = Math.abs(Math.cos(instance.rotation[1]));
            const sine = Math.abs(Math.sin(instance.rotation[1]));
            const footprintX = instance.dimensions[0] * cosine + instance.dimensions[2] * sine;
            expect(
              Math.abs(instance.position[0]) + footprintX / 2,
              `${instance.dressingId} must remain in the urban pedestrian corridor`,
            ).toBeLessThanOrEqual(facadeInnerEdge + 0.01);
          }
        }

        const distortedDressing: string[] = [];
        for (const instance of recipe.locations[locationId]!.dressingInstances) {
          expect(instance.position[1] - instance.dimensions[1] / 2).toBeGreaterThanOrEqual(-0.01);
          if (instance.renderKind === "asset") {
            const spread = relativeScaleSpread(instance.dimensions, instance.asset.dimensions);
            if (spread > 1.2) distortedDressing.push(`${instance.dressingId} -> ${instance.asset.key} (${spread.toFixed(2)}x)`);
          }
          if (instance.wall) {
            const cosine = Math.abs(Math.cos(instance.rotation[1]));
            const sine = Math.abs(Math.sin(instance.rotation[1]));
            const footprintX = instance.dimensions[0] * cosine + instance.dimensions[2] * sine;
            const footprintZ = instance.dimensions[0] * sine + instance.dimensions[2] * cosine;
            const clearance = instance.wall === "west" || instance.wall === "east"
              ? bounds[0] / 2 - Math.abs(instance.position[0]) - footprintX / 2
              : bounds[2] / 2 - Math.abs(instance.position[2]) - footprintZ / 2;
            expect(clearance, `${instance.dressingId} must clear wall trim`).toBeGreaterThanOrEqual(
              WALL_COMPOSITION.dressingClearance - 0.005,
            );
          }
        }
        expect(distortedDressing).toEqual([]);
      });
    }
  }

  it("uses wall-anchored Juliet balconies and visibly displaced canal water", () => {
    expect(
      URBAN_HUMAN_SCALE.balconyCenterProjection + URBAN_HUMAN_SCALE.balconyDepth / 2,
    ).toBeLessThanOrEqual(0.38);
    expect(
      URBAN_HUMAN_SCALE.balconyCenterProjection - URBAN_HUMAN_SCALE.balconyDepth / 2,
    ).toBeCloseTo(0, 5);
    expect(URBAN_HUMAN_SCALE.canalWaveAmplitude).toBeGreaterThanOrEqual(0.1);
    expect(
      URBAN_HUMAN_SCALE.canalWaterLevel - URBAN_HUMAN_SCALE.canalWaveAmplitude,
    ).toBeGreaterThanOrEqual(URBAN_HUMAN_SCALE.canalBedTop);
    const waterVolumeTop = URBAN_HUMAN_SCALE.canalWaterLevel
      - URBAN_HUMAN_SCALE.canalWaveAmplitude
      - URBAN_HUMAN_SCALE.canalVolumeClearance;
    expect(waterVolumeTop).toBeLessThan(
      URBAN_HUMAN_SCALE.canalWaterLevel - URBAN_HUMAN_SCALE.canalWaveAmplitude,
    );
    expect(waterVolumeTop).toBeGreaterThan(URBAN_HUMAN_SCALE.canalBedTop);
    expect(
      URBAN_HUMAN_SCALE.horizonCenterFactor - URBAN_HUMAN_SCALE.horizonApronDepthRatio / 2,
    ).toBeLessThan(0.5);
  });
});
