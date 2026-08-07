import { describe, expect, it } from "vitest";

import courtyardSnapshotFixture from "../../fixtures/snapshot_courtyard_1.json";
import courtyardPlanFixture from "../../fixtures/visual_scene_plan_courtyard_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import type { ResolvedDressingInstance } from "./dressingResolver";
import { centerYForSurfaceContact, supportPlaneWorldY } from "./supportSurfaces";
import { repairSceneComposition } from "./sceneCompositionRepair";
import { compileSceneRecipe } from "./sceneRecipeCompiler";

const snapshot = courtyardSnapshotFixture as unknown as WorldSnapshot;
const plan = courtyardPlanFixture as unknown as VisualScenePlan;

function compiledLocation() {
  const recipe = compileSceneRecipe(snapshot, plan);
  return {
    recipe,
    location: recipe.locations["coaching-courtyard"]!,
  };
}

describe("scene composition repair", () => {
  it("suppresses the later duplicate while preserving canonical story entities", () => {
    const { recipe, location } = compiledLocation();
    const original = location.dressingInstances.find(
      (instance) => instance.renderKind === "asset" && instance.placementAnchor === "floor",
    )!;
    const duplicate: ResolvedDressingInstance = {
      ...original,
      dressingId: `${original.dressingId}:duplicate`,
    };
    const entityIdsBefore = snapshot.entities.map((entity) => entity.id);

    const repaired = repairSceneComposition(
      snapshot,
      { [location.locationId]: location.presentation },
      recipe.assetRegistry,
      { [location.locationId]: [original, duplicate] },
    );

    expect(repaired.dressingByLocation[location.locationId]?.map((instance) => instance.dressingId))
      .toEqual([original.dressingId]);
    expect(repaired.repairs).toEqual([
      expect.objectContaining({
        dressingId: duplicate.dressingId,
        action: "suppressed",
        issueCodes: expect.arrayContaining(["duplicate_dressing"]),
      }),
    ]);
    expect(repaired.composition.errorCount).toBe(0);
    expect(snapshot.entities.map((entity) => entity.id)).toEqual(entityIdsBefore);
  });

  it("cascades suppression to decorative children when their support is removed", () => {
    const { recipe, location } = compiledLocation();
    const source = location.dressingInstances.find(
      (instance) => instance.renderKind === "asset" && instance.placementAnchor === "floor",
    )!;
    const floatingSupport: ResolvedDressingInstance = {
      ...source,
      dressingId: `${source.dressingId}:floating-support`,
      position: [source.position[0], source.position[1] + 0.7, source.position[2]],
    };
    const childDimensions: [number, number, number] = [0.16, 0.12, 0.14];
    const child: ResolvedDressingInstance = {
      ...source,
      dressingId: `${source.dressingId}:supported-child`,
      placementAnchor: "surface",
      supportId: floatingSupport.dressingId,
      dimensions: childDimensions,
      position: [
        floatingSupport.position[0],
        centerYForSurfaceContact(supportPlaneWorldY({
          position: floatingSupport.position,
          dimensions: floatingSupport.dimensions,
          rotation: floatingSupport.rotation,
          supportSurfaceY: floatingSupport.renderKind === "asset"
            ? floatingSupport.asset.supportSurfaceY
            : undefined,
        }), childDimensions),
        floatingSupport.position[2],
      ],
    };

    const repaired = repairSceneComposition(
      snapshot,
      { [location.locationId]: location.presentation },
      recipe.assetRegistry,
      { [location.locationId]: [floatingSupport, child] },
    );

    expect(repaired.dressingByLocation[location.locationId]).toEqual([]);
    expect(repaired.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({ dressingId: floatingSupport.dressingId, reason: "invalid_placement" }),
      expect.objectContaining({ dressingId: child.dressingId, reason: "support_removed" }),
    ]));
  });

  it("reports canonical blocking errors without suppressing canonical entities", () => {
    const blockedSnapshot: WorldSnapshot = {
      ...snapshot,
      entities: snapshot.entities.map((entity) =>
        entity.id === "courtyard-table-1"
          ? { ...entity, transform: { position: [0, 0.6, -12] } }
          : entity,
      ),
    };

    const recipe = compileSceneRecipe(blockedSnapshot, plan);

    expect(recipe.composition.status).toBe("blocking");
    expect(recipe.compositionRepairs).toEqual([]);
    expect(recipe.composition.locations["coaching-courtyard"]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "blocked_access",
          entityIds: expect.arrayContaining(["courtyard-table-1"]),
        }),
      ]),
    );
  });
});
