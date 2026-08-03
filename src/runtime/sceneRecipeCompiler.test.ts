import { describe, expect, it } from "vitest";
import atticSnapshotFixture from "../../fixtures/snapshot_1.json";
import atticPlanFixture from "../../fixtures/visual_scene_plan_1.json";
import conservatorySnapshotFixture from "../../fixtures/snapshot_conservatory_1.json";
import conservatoryPatchFixture from "../../fixtures/patch_conservatory_2.json";
import conservatoryPlan1Fixture from "../../fixtures/visual_scene_plan_conservatory_1.json";
import conservatoryPlan2Fixture from "../../fixtures/visual_scene_plan_conservatory_2.json";
import courtyardSnapshotFixture from "../../fixtures/snapshot_courtyard_1.json";
import courtyardPatchFixture from "../../fixtures/patch_courtyard_2.json";
import courtyardPlan1Fixture from "../../fixtures/visual_scene_plan_courtyard_1.json";
import courtyardPlan2Fixture from "../../fixtures/visual_scene_plan_courtyard_2.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch } from "./applyScenePatch";
import { compileSceneRecipe } from "./sceneRecipeCompiler";

describe("scene recipe compiler", () => {
  it("compiles the attic from semantic modules without story-specific recipe code", () => {
    const recipe = compileSceneRecipe(
      atticSnapshotFixture as unknown as WorldSnapshot,
      atticPlanFixture as unknown as VisualScenePlan,
    );
    const attic = recipe.locations["attic-study"];

    expect(recipe.styleKit.id).toBe("storybook-historical");
    expect(recipe.status).toBe("ready");
    expect(recipe.coverage).toEqual({
      total: 8,
      approved: 8,
      designedFallback: 0,
      queuedForGeneration: 0,
      approvedPercent: 100,
    });
    expect(attic?.environmentModules.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining([
        "shell:solid-room",
        "surface:wood-floorboards",
        "wall:aged-plaster",
        "structure:timber-frame",
        "opening:small-window",
      ]),
    );
    expect(attic?.dressingModules.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining([
        "dressing:books",
        "dressing:storage-crates",
        "dressing:travel-chest",
      ]),
    );
  });

  it("selects a different module composition for the conservatory", () => {
    const recipe = compileSceneRecipe(
      conservatorySnapshotFixture as unknown as WorldSnapshot,
      conservatoryPlan1Fixture as unknown as VisualScenePlan,
    );
    const conservatory = recipe.locations["moonlit-conservatory"];

    expect(recipe.styleKit.id).toBe("botanical-gothic");
    expect(recipe.status).toBe("assets_pending");
    expect(recipe.coverage).toEqual({
      total: 5,
      approved: 4,
      designedFallback: 1,
      queuedForGeneration: 1,
      approvedPercent: 80,
    });
    expect(conservatory?.environmentModules.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining([
        "shell:glasshouse",
        "surface:stone-tiles",
        "structure:iron-frame",
      ]),
    );
    expect(conservatory?.environmentModules.map((module) => module.moduleId))
      .not.toContain("shell:solid-room");
    expect(conservatory?.dressingModules.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining(["dressing:planters", "dressing:climbing-vines"]),
    );
    expect(recipe.fallbackEntityIds).toEqual(["orrery-1"]);
    expect(recipe.generationJobs[0]).toMatchObject({
      entityId: "orrery-1",
      strategy: "image_to_mesh",
      priority: "hero",
    });
  });

  it("keeps asset and module decisions stable while compiling the next passage", () => {
    const opening = conservatorySnapshotFixture as unknown as WorldSnapshot;
    const awakened = applyScenePatch(opening, conservatoryPatchFixture as unknown as ScenePatch);
    const recipe = compileSceneRecipe(
      awakened,
      conservatoryPlan2Fixture as unknown as VisualScenePlan,
    );

    expect(recipe.snapshotVersion).toBe(2);
    expect(recipe.planVersion).toBe(2);
    expect(recipe.coverage.approved).toBe(5);
    expect(recipe.fallbackEntityIds).toEqual(["orrery-1"]);
    expect(recipe.approvedAssets.find((asset) => asset.entityId === "conservatory-worktable-1"))
      .toMatchObject({ catalogId: "polyhaven:wooden_table_02" });
  });

  it("builds a fully approved outdoor recipe and preserves it through a patch", () => {
    const opening = courtyardSnapshotFixture as unknown as WorldSnapshot;
    const openingRecipe = compileSceneRecipe(
      opening,
      courtyardPlan1Fixture as unknown as VisualScenePlan,
    );
    const departure = applyScenePatch(opening, courtyardPatchFixture as unknown as ScenePatch);
    const departureRecipe = compileSceneRecipe(
      departure,
      courtyardPlan2Fixture as unknown as VisualScenePlan,
    );

    expect(openingRecipe.styleKit.id).toBe("storybook-historical");
    expect(openingRecipe.coverage).toMatchObject({ total: 5, approved: 5, approvedPercent: 100 });
    expect(openingRecipe.locations["coaching-courtyard"]?.environmentModules.map((module) => module.moduleId))
      .toContain("shell:open-air");
    expect(openingRecipe.composition.status).toBe("clean");
    const openingDressing = openingRecipe.locations["coaching-courtyard"]?.dressingInstances ?? [];
    const departureDressing = departureRecipe.locations["coaching-courtyard"]?.dressingInstances ?? [];
    expect(openingDressing).toHaveLength(5);
    expect(openingDressing.every((instance) => instance.decorativeOnly)).toBe(true);
    expect(openingDressing.map((instance) => instance.catalogId)).toEqual(expect.arrayContaining([
      "polyhaven:wine_barrel_01",
      "polyhaven:painted_wooden_bench",
      "polyhaven:wooden_crate_01",
    ]));
    expect(departureDressing.map(({ dressingId, position }) => ({ dressingId, position })))
      .toEqual(openingDressing.map(({ dressingId, position }) => ({ dressingId, position })));
    expect(departureRecipe.coverage).toMatchObject({ total: 6, approved: 6, approvedPercent: 100 });
    expect(departureRecipe.approvedAssets.find((asset) => asset.entityId === "courtyard-map-1"))
      .toMatchObject({ catalogId: "project:parchment-map-v1" });
    expect(departureRecipe.composition.status).toBe("clean");
  });

  it("removes presentation-only props when the visual plan drops their source tag", () => {
    const planWithoutClutter = structuredClone(
      courtyardPlan1Fixture,
    ) as unknown as VisualScenePlan;
    planWithoutClutter.locations[0]!.dressingTags = planWithoutClutter.locations[0]!.dressingTags
      .filter((tag) => tag !== "courtyard-clutter");

    const recipe = compileSceneRecipe(
      courtyardSnapshotFixture as unknown as WorldSnapshot,
      planWithoutClutter,
    );

    expect(recipe.locations["coaching-courtyard"]?.dressingInstances).toEqual([]);
    expect(recipe.approvedAssets).toHaveLength(5);
  });

  it("derives surface, facing, wall-clearance, and centering constraints from facts", () => {
    const recipe = compileSceneRecipe(
      conservatorySnapshotFixture as unknown as WorldSnapshot,
      conservatoryPlan1Fixture as unknown as VisualScenePlan,
    );

    expect(recipe.placementConstraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "face_target",
        entityId: "conservatory-chair-1",
        targetEntityId: "conservatory-worktable-1",
      }),
      expect.objectContaining({ kind: "center_in_room", entityId: "conservatory-runner-1" }),
      expect.objectContaining({ kind: "reserve_access_zone", entityId: "conservatory-door-1" }),
      expect.objectContaining({
        kind: "anchor_to_surface",
        entityId: "orrery-1",
        targetEntityId: "conservatory-worktable-1",
      }),
    ]));
  });
});
