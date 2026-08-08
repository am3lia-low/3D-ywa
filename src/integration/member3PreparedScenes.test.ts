import { describe, expect, it } from "vitest";
import { BOOKS, SNAPSHOTS } from "../../Create UI Prototype for Hackathon/src/data/mockData";
import { buildMockSpatialScene } from "../../Create UI Prototype for Hackathon/src/spatial/mockSpatialAdapter";
import { compileSceneRecipe } from "../runtime/sceneRecipeCompiler";
import { createWorldLayout, supportSurfaceWorldY } from "../runtime/layoutEngine";
import { URBAN_HUMAN_SCALE, urbanWalkableSurfaceTop } from "../runtime/urbanComposition";
import { WALL_COMPOSITION } from "../runtime/wallComposition";
import { isPortalSourceEntity } from "../runtime/portalRouting";

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
        expect(recipe.compositionRepairs, "approved demo scenes must not require runtime suppression")
          .toEqual([]);
        const locationId = scene.spatialSnapshot.locations[0]!.id;
        const bounds = scene.spatialSnapshot.locations[0]!.bounds!;
        const layout = createWorldLayout(scene.spatialSnapshot, recipe.assetRegistry, [], locationId);

        expect(recipe.status).toBe("ready");
        expect(
          recipe.composition.status,
          JSON.stringify(
            Object.values(recipe.composition.locations).flatMap((report) => report.issues),
            null,
            2,
          ),
        ).not.toBe("blocking");
        expect(recipe.composition.errorCount).toBe(0);
        expect(recipe.coverage.approvedPercent).toBe(100);
        expect(recipe.fallbackEntityIds).toEqual([]);
        expect(recipe.generationJobs).toEqual([]);

        if (scene.visualPlan.locations[0]?.dressingTags.includes("estate-furnishings")) {
          expect(
            recipe.locations[locationId]!.dressingInstances.some(
              (instance) => instance.dressingId.split(":").at(-1) === "central-room-rug",
            ),
          ).toBe(false);
        }

        if (uiSnapshot.entities.some((entity) => entity.id === "hidden-drawer")) {
          expect(scene.spatialSnapshot.entities.some((entity) => entity.id === "hidden-drawer")).toBe(false);
          expect(
            layout.items.filter((item) => item.asset.key === "desk").map((item) => item.entity.id),
          ).toEqual(["desk"]);
        }

        if (scene.spatialSnapshot.entities.some((entity) => entity.id === "armchair")) {
          expect(recipe.assetRegistry.armchair?.key).toBe("victorian-armchair");
          expect(layout.items.find((item) => item.entity.id === "armchair")?.dimensions[1]).toBeGreaterThanOrEqual(1.4);
        }

        if (uiSnapshot.entities.some((entity) => entity.id === "clock")) {
          expect(recipe.assetRegistry.clock?.key).toBe("victorian-mantel-clock");
          expect(scene.spatialSnapshot.relations).toContainEqual(expect.objectContaining({
            subjectId: "clock",
            predicate: "on",
            objectId: "fireplace",
          }));
        }

        if (uiSnapshot.entities.some((entity) => entity.id === "schoolroom")) {
          expect(scene.spatialSnapshot.entities.some((entity) => entity.id === "schoolroom")).toBe(false);
          expect(recipe.assetRegistry.schoolroom).toBeUndefined();
          const schoolroom = scene.spatialSnapshot.locations.find((location) => location.id.endsWith(":schoolroom"))!;
          const schoolroomLayout = createWorldLayout(
            scene.spatialSnapshot,
            recipe.assetRegistry,
            [],
            schoolroom.id,
          );
          const table = schoolroomLayout.items.find((item) => item.entity.id === "schoolroom-table")!;
          const ledger = schoolroomLayout.items.find((item) => item.entity.id === "schoolroom-ledger")!;
          const shelf = schoolroomLayout.items.find((item) => item.entity.id === "schoolroom-shelf")!;
          const photograph = schoolroomLayout.items.find((item) => item.entity.id === "small-photograph")!;
          const schoolroomRecipe = recipe.locations[schoolroom.id]!;

          expect(scene.spatialSnapshot.locations).toHaveLength(2);
          expect(scene.spatialSnapshot.entities.filter((entity) => entity.locationId === schoolroom.id).map((entity) => entity.id))
            .toEqual(expect.arrayContaining(["schoolroom-table", "schoolroom-shelf", "schoolroom-ledger", "horse-figurine", "small-photograph"]));
          expect(recipe.locations[locationId]!.presentation.portalTargetLocationId).toBe(schoolroom.id);
          expect(recipe.locations[locationId]!.presentation.portalSourceEntityId).toBe("east-hall-door");
          expect(layout.items.some((item) => item.entity.id === "east-hall-door")).toBe(true);
          expect(schoolroomRecipe.presentation.portalTargetLocationId).toBe(locationId);
          expect(schoolroomRecipe.presentation.portalSourceEntityId).toBe("east-hall-door");
          expect(isPortalSourceEntity("east-hall-door", schoolroomRecipe.presentation.portalSourceEntityId)).toBe(true);
          expect(isPortalSourceEntity("staircase-door", schoolroomRecipe.presentation.portalSourceEntityId)).toBe(false);
          expect(schoolroomRecipe.presentation.portalIsReturn).toBe(true);
          expect(schoolroomRecipe.presentation.location.architectureTags).not.toContain("estate-paneling");
          expect(ledger.position[1] - ledger.dimensions[1] / 2)
            .toBeCloseTo(table.position[1] + table.dimensions[1] / 2 + 0.008, 3);
          expect(Math.abs(ledger.position[0] - table.position[0]))
            .toBeLessThan(table.dimensions[0] * 0.2);
          expect(Math.abs(ledger.position[2] - table.position[2]))
            .toBeLessThan(table.dimensions[2] * 0.2);
          expect(Math.abs(photograph.position[0] - shelf.position[0])).toBeLessThan(shelf.dimensions[0] / 2);
          expect(photograph.position[1] - photograph.dimensions[1] / 2)
            .toBeCloseTo(
              shelf.position[1] - shelf.dimensions[1] / 2 + shelf.dimensions[1] * 0.78 + 0.008,
              3,
            );
          expect(Math.abs(photograph.position[2] - shelf.position[2])).toBeLessThan(0.5);
          expect(schoolroomRecipe.dressingInstances.map((instance) => instance.dressingId.split(":").at(-1)))
            .toEqual(expect.arrayContaining(["schoolroom-chair-west", "schoolroom-chair-east"]));
          for (const schoolroomChair of schoolroomRecipe.dressingInstances.filter((instance) =>
            /schoolroom-chair-(?:west|east)$/.test(instance.dressingId)
          )) {
            expect(schoolroomChair.renderKind).toBe("asset");
            if (schoolroomChair.renderKind === "asset") {
              expect(schoolroomChair.asset.key).toBe("chair");
            }
          }
          const schoolroomSupplyCabinet = schoolroomRecipe.dressingInstances.find((instance) =>
            instance.dressingId.endsWith(":schoolroom-supply-cabinet"),
          );
          expect(schoolroomSupplyCabinet?.renderKind).toBe("asset");
          if (schoolroomSupplyCabinet?.renderKind === "asset") {
            expect(schoolroomSupplyCabinet.asset.key).toBe("victorian-document-drawers");
          }
          expect(schoolroomRecipe.dressingInstances.map((instance) => instance.dressingId.split(":").at(-1)))
            .not.toContain("schoolroom-copybooks");
          const schoolroomBasket = schoolroomRecipe.dressingInstances.find((instance) =>
            instance.dressingId.endsWith(":schoolroom-copybook-basket"),
          );
          expect(schoolroomBasket?.renderKind).toBe("asset");
          if (schoolroomBasket?.renderKind === "asset") {
            expect(schoolroomBasket.asset.key).toBe("woven-reading-basket");
          }
          expect(schoolroomRecipe.dressingInstances.map((instance) => instance.dressingId.split(":").at(-1)))
            .not.toContain("schoolroom-copybook-shelf");
          expect(schoolroomRecipe.dressingInstances.map((instance) => instance.dressingId.split(":").at(-1)))
            .not.toContain("west-floor-lamp");
          expect(schoolroomRecipe.dressingInstances.map((instance) => instance.dressingId.split(":").at(-1)))
            .not.toContain("east-floor-lamp");
        }

        const deskPortrait = uiSnapshot.entities.find((entity) =>
          entity.id === "small-photograph" && /desk/i.test(entity.currentLocation ?? ""),
        );
        if (deskPortrait) {
          const desk = layout.items.find((item) => item.entity.id === "desk")!;
          const photograph = layout.items.find((item) => item.entity.id === "small-photograph")!;
          expect(scene.spatialSnapshot.relations).toContainEqual(expect.objectContaining({
            subjectId: "small-photograph",
            predicate: "on",
            objectId: "desk",
          }));
          expect(photograph.position[1] - photograph.dimensions[1] / 2)
            .toBeCloseTo(desk.position[1] - desk.dimensions[1] / 2 + desk.dimensions[1] * (desk.asset.supportSurfaceY ?? 1) + 0.008, 3);
          expect(Math.abs(photograph.position[0] - desk.position[0])).toBeGreaterThan(desk.dimensions[0] * 0.3);
          expect(Math.abs(photograph.position[2] - desk.position[2])).toBeGreaterThan(desk.dimensions[2] * 0.25);
        }

        const stairMap = uiSnapshot.entities.find((entity) =>
          entity.id === "hand-drawn-map" && /stair/i.test(entity.currentLocation ?? ""),
        );
        if (stairMap) {
          const stairs = layout.items.find((item) => item.entity.id === "staircase-steps")!;
          const map = layout.items.find((item) => item.entity.id === "hand-drawn-map")!;
          expect(stairs.entity.state?.presentationOccluded).toBe(true);
          expect(map.entity.state?.presentationOccluded).toBe(true);
          expect(scene.spatialSnapshot.relations).toContainEqual(expect.objectContaining({
            subjectId: "hand-drawn-map",
            predicate: "on",
            objectId: "staircase-steps",
          }));
          expect(map.position[1] - map.dimensions[1] / 2)
            .toBeCloseTo(supportSurfaceWorldY(stairs) + 0.008, 3);
          const staircaseDoor = layout.items.find((item) => item.entity.id === "staircase-door")!;
          expect(Math.abs(stairs.position[0] - staircaseDoor.position[0])).toBeLessThan(2.2);
          expect(Math.abs(stairs.position[2] - staircaseDoor.position[2])).toBeLessThan(0.1);
        }

        const sillMap = uiSnapshot.entities.find((entity) =>
          entity.id === "hand-drawn-map" && /sill/i.test(entity.currentLocation ?? ""),
        );
        if (sillMap) {
          const window = layout.items.find((item) => item.entity.id === "bay-window")!;
          const map = layout.items.find((item) => item.entity.id === "hand-drawn-map")!;
          expect(scene.spatialSnapshot.relations).toContainEqual(expect.objectContaining({
            subjectId: "hand-drawn-map",
            predicate: "on",
            objectId: "bay-window",
          }));
          expect(map.position[1] - map.dimensions[1] / 2)
            .toBeCloseTo(supportSurfaceWorldY(window) + 0.008, 3);
          expect(map.position[1]).toBeGreaterThan(1.5);
        }

        if (uiSnapshot.entities.some((entity) => entity.id === "staircase-door")) {
          expect(scene.spatialSnapshot.relations).toContainEqual(expect.objectContaining({
            subjectId: "staircase-door",
            predicate: "against_wall",
            metadata: { wall: "west" },
          }));
          expect(Math.abs(layout.items.find((item) => item.entity.id === "staircase-door")!.position[0]))
            .toBeGreaterThan(bounds[0] * 0.4);
        }

        for (const item of layout.items) {
          expect(Number.isFinite(item.position[0] + item.position[1] + item.position[2])).toBe(true);
          expect(Math.abs(item.position[0])).toBeLessThanOrEqual(bounds[0] / 2 + 0.01);
          expect(Math.abs(item.position[2])).toBeLessThanOrEqual(bounds[2] / 2 + 0.01);
          const asset = recipe.assetRegistry[item.entity.id]!;
          expect(
            relativeScaleSpread(item.dimensions, asset.dimensions),
            `${item.entity.id} -> ${asset.key} must preserve the approved asset proportions`,
          ).toBeLessThanOrEqual(1.2);
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
          if (instance.placementAnchor === "floor") {
            expect(
              instance.position[1] - instance.dimensions[1] / 2,
              `${instance.dressingId} must make exact floor contact`,
            ).toBeCloseTo(
              recipe.locations[locationId]!.presentation.architecture.urbanStreet
                ? urbanWalkableSurfaceTop(bounds[0], instance.position[0]) + (instance.verticalOffset ?? 0)
                : instance.verticalOffset ?? 0,
              5,
            );
          }
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
