import { describe, expect, it } from "vitest";
import atticSnapshotFixture from "../../fixtures/snapshot_1.json";
import atticPlanFixture from "../../fixtures/visual_scene_plan_1.json";
import atticPatch2Fixture from "../../fixtures/patch_2.json";
import atticPatch3Fixture from "../../fixtures/patch_3.json";
import atticPlan3Fixture from "../../fixtures/visual_scene_plan_3.json";
import conservatorySnapshotFixture from "../../fixtures/snapshot_conservatory_1.json";
import conservatoryPatchFixture from "../../fixtures/patch_conservatory_2.json";
import conservatoryPlan1Fixture from "../../fixtures/visual_scene_plan_conservatory_1.json";
import conservatoryPlan2Fixture from "../../fixtures/visual_scene_plan_conservatory_2.json";
import courtyardSnapshotFixture from "../../fixtures/snapshot_courtyard_1.json";
import courtyardPatchFixture from "../../fixtures/patch_courtyard_2.json";
import courtyardPlan1Fixture from "../../fixtures/visual_scene_plan_courtyard_1.json";
import courtyardPlan2Fixture from "../../fixtures/visual_scene_plan_courtyard_2.json";
import woodlandSnapshotFixture from "../../fixtures/snapshot_woodland_1.json";
import woodlandPlanFixture from "../../fixtures/visual_scene_plan_woodland_1.json";
import worldFamiliesFixture from "../../fixtures/story_package_world_families_demo.json";
import interiorStressFixture from "../../fixtures/interior_scene_stress_cases.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch } from "./applyScenePatch";
import { compileSceneRecipe } from "./sceneRecipeCompiler";

describe("scene recipe compiler", () => {
  it("turns unfamiliar interior prose into deterministic floor, wall, and surface decoration", () => {
    const snapshot: WorldSnapshot = {
      storyId: "story-unfamiliar-study",
      version: 1,
      passageId: "P1",
      locations: [{ id: "blue-study", name: "The Blue Study", bounds: [24, 6, 20] }],
      entities: [
        {
          id: "study-desk",
          name: "Walnut writing desk",
          kind: "furniture",
          locationId: "blue-study",
          assetKey: "desk",
          aliases: ["writing table"],
        },
        {
          id: "study-hearth",
          name: "Carved stone fireplace and mantel",
          kind: "architecture",
          locationId: "blue-study",
          assetKey: "fireplace",
        },
      ],
      relations: [
        {
          id: "study-hearth:north-wall",
          subjectId: "study-hearth",
          predicate: "against_wall",
          metadata: { wall: "north" },
        },
      ],
      conflicts: [],
    };
    const plan: VisualScenePlan = {
      schemaVersion: "1.0",
      storyId: snapshot.storyId,
      segmentId: "blue-study-opening",
      sourcePassageIds: ["P1"],
      snapshotVersion: 1,
      planVersion: 1,
      artDirection: {
        styleLabel: "painterly historical storybook",
        stylePrompt: "A warm, grounded old-world interior with tactile natural materials.",
        negativePrompt: ["empty room", "floating props"],
        materialVocabulary: ["walnut", "aged brass", "woven wool"],
      },
      locations: [{
        locationId: "blue-study",
        archetype: "unfamiliar blue writer's study",
        visualDescription: "An indoor historical writing room, parlor and reading nook arranged around a carved fireplace.",
        architectureTags: ["aged-plaster", "wood-floorboards"],
        dressingTags: [],
        dressingDensity: "rich",
        mood: "warm and contemplative",
        timeOfDay: "evening",
        palette: {
          background: "#171a20", fog: "#23262d", floor: "#49382e", wall: "#7c807f",
          timber: "#39251d", ambient: "#c9bea9", keyLight: "#e0d8c9", practical: "#f0a85d",
        },
        lighting: {
          warmth: "warm",
          contrast: "medium",
          ambientIntensity: 0.72,
          keyIntensity: 1.4,
          atmosphericEffects: ["dust-motes"],
        },
        evidence: { passageIds: ["P1"], confidence: 0.62, basis: "cross_passage_inference" },
      }],
      entities: snapshot.entities.map((entity) => ({
        entityId: entity.id,
        visualDescription: entity.name,
        importance: "hero" as const,
        materials: ["natural material"],
        colors: ["warm brown"],
        assetSearchTags: [entity.assetKey ?? entity.kind],
        evidence: { passageIds: ["P1"], confidence: 0.9, basis: "explicit_text" as const },
      })),
      presentationConnections: [],
      unresolvedQuestions: [],
    };

    const first = compileSceneRecipe(snapshot, plan).locations["blue-study"]!;
    const second = compileSceneRecipe(snapshot, plan).locations["blue-study"]!;
    const anchors = new Set(first.dressingInstances.map((instance) => instance.placementAnchor));
    const supported = first.dressingInstances.filter((instance) => instance.placementAnchor === "surface");

    expect(first.presentation.location.dressingTags).toEqual(expect.arrayContaining([
      "period-interior",
      "writing-room",
      "reading-nook",
      "parlor",
      "mantel-display",
    ]));
    expect(anchors).toEqual(new Set(["floor", "surface", "wall"]));
    expect(supported.length).toBeGreaterThanOrEqual(4);
    expect(supported.every((instance) => Boolean(instance.supportId))).toBe(true);
    expect(supported
      .map((instance) => instance.supportId!)
      .filter((supportId) => !/(?:desk|hearth|side-table|console|coffee-table)/.test(supportId)))
      .toEqual([]);
    expect(supported.some((instance) => instance.supportId === "study-desk")).toBe(true);
    expect(supported.some((instance) => instance.supportId === "study-hearth")).toBe(true);
    expect(first.dressingInstances
      .filter((instance) => instance.placementAnchor === "floor")
      .every((instance) => Math.abs(instance.position[1] - instance.dimensions[1] / 2) < 0.001))
      .toBe(true);
    expect(supported.every(
      (instance) => instance.position[1] - instance.dimensions[1] / 2 > 0.5,
    )).toBe(true);
    const rotatedFootprint = (dimensions: [number, number, number], yaw: number) => [
      dimensions[0] * Math.abs(Math.cos(yaw)) + dimensions[2] * Math.abs(Math.sin(yaw)),
      dimensions[1],
      dimensions[0] * Math.abs(Math.sin(yaw)) + dimensions[2] * Math.abs(Math.cos(yaw)),
    ] as const;
    for (let leftIndex = 0; leftIndex < first.dressingInstances.length; leftIndex += 1) {
      const left = first.dressingInstances[leftIndex]!;
      const leftSize = rotatedFootprint(left.dimensions, left.rotation[1]);
      for (let rightIndex = leftIndex + 1; rightIndex < first.dressingInstances.length; rightIndex += 1) {
        const right = first.dressingInstances[rightIndex]!;
        if (left.supportId === right.dressingId || right.supportId === left.dressingId) continue;
        const rightSize = rotatedFootprint(right.dimensions, right.rotation[1]);
        const overlaps = Math.abs(left.position[0] - right.position[0]) < (leftSize[0] + rightSize[0]) / 2 + 0.15 &&
          Math.abs(left.position[1] - right.position[1]) < (leftSize[1] + rightSize[1]) / 2 + 0.07 &&
          Math.abs(left.position[2] - right.position[2]) < (leftSize[2] + rightSize[2]) / 2 + 0.15;
        expect(overlaps, `${left.dressingId} overlaps ${right.dressingId}`).toBe(false);
      }
    }
    expect(first.dressingInstances.map(({ dressingId, position, supportId }) => ({ dressingId, position, supportId })))
      .toEqual(second.dressingInstances.map(({ dressingId, position, supportId }) => ({ dressingId, position, supportId })));
  });

  it.each(interiorStressFixture.cases)(
    "keeps $id decoration applicable and rejects incompatible interior kits",
    (stressCase) => {
      const locationId = stressCase.id;
      const snapshot: WorldSnapshot = {
        storyId: `story-${stressCase.id}`,
        version: 1,
        passageId: "P1",
        locations: [{ id: locationId, name: stressCase.archetype, bounds: [24, 6, 20] }],
        entities: [
          {
            id: `${locationId}:desk`,
            name: "Story work desk",
            kind: "furniture",
            locationId,
            assetKey: "desk",
            aliases: ["chart table", "writing table"],
          },
          {
            id: `${locationId}:hearth`,
            name: "Stone fireplace mantel",
            kind: "architecture",
            locationId,
            assetKey: "fireplace",
          },
        ],
        relations: [{
          id: `${locationId}:hearth:north-wall`,
          subjectId: `${locationId}:hearth`,
          predicate: "against_wall",
          metadata: { wall: "north" },
        }],
        conflicts: [],
      };
      const plan: VisualScenePlan = {
        schemaVersion: "1.0",
        storyId: snapshot.storyId,
        segmentId: `${stressCase.id}:opening`,
        sourcePassageIds: ["P1"],
        snapshotVersion: 1,
        planVersion: 1,
        artDirection: {
          styleLabel: stressCase.id === "modern-office"
            ? "contemporary grounded realism"
            : "painterly historical storybook",
          stylePrompt: stressCase.visualDescription,
          negativePrompt: ["floating props", "incompatible furniture"],
          materialVocabulary: ["tactile materials"],
        },
        locations: [{
          locationId,
          archetype: stressCase.archetype,
          visualDescription: stressCase.visualDescription,
          architectureTags: ["enclosed room"],
          dressingTags: [],
          dressingDensity: "rich",
          mood: "narrative and atmospheric",
          timeOfDay: "evening",
          palette: {
            background: "#171a20", fog: "#252b31", floor: "#493a31", wall: "#858078",
            timber: "#3b2d25", ambient: "#c8c0b2", keyLight: "#e2ddd0", practical: "#eda95f",
          },
          lighting: {
            warmth: "warm",
            contrast: "medium",
            ambientIntensity: 0.7,
            keyIntensity: 1.4,
            atmosphericEffects: [],
          },
          evidence: { passageIds: ["P1"], confidence: 0.62, basis: "cross_passage_inference" },
        }],
        entities: snapshot.entities.map((entity) => ({
          entityId: entity.id,
          visualDescription: entity.name,
          importance: "hero" as const,
          materials: ["natural materials"],
          colors: ["grounded neutral"],
          assetSearchTags: [entity.assetKey ?? entity.kind],
          evidence: { passageIds: ["P1"], confidence: 0.9, basis: "explicit_text" as const },
        })),
        presentationConnections: [],
        unresolvedQuestions: [],
      };

      const location = compileSceneRecipe(snapshot, plan).locations[locationId]!;
      expect(location.presentation.location.dressingTags)
        .toEqual(expect.arrayContaining(stressCase.expectedTags));
      expect(stressCase.forbiddenTags.filter(
        (tag) => location.presentation.location.dressingTags.includes(tag),
      )).toEqual([]);
      expect(location.dressingInstances.length).toBeGreaterThanOrEqual(stressCase.minimumDecorations);
      expect(location.dressingInstances.every((instance) => instance.decorativeOnly)).toBe(true);
    },
  );

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
    expect(attic?.dressingInstances).toHaveLength(4);
    expect(attic?.dressingInstances.map((instance) => instance.renderKind)).toEqual(
      expect.arrayContaining(["asset", "module"]),
    );
  });

  it("preserves attic dressing identities while story entities change", () => {
    const opening = atticSnapshotFixture as unknown as WorldSnapshot;
    const version2 = applyScenePatch(opening, atticPatch2Fixture as unknown as ScenePatch);
    const version3 = applyScenePatch(version2, atticPatch3Fixture as unknown as ScenePatch);
    const openingIds = compileSceneRecipe(
      opening,
      atticPlanFixture as unknown as VisualScenePlan,
    ).locations["attic-study"]!.dressingInstances.map((instance) => instance.dressingId);
    const version2Instances = compileSceneRecipe(
      version2,
      atticPlanFixture as unknown as VisualScenePlan,
    ).locations["attic-study"]!.dressingInstances;
    const version3Instances = compileSceneRecipe(
      version3,
      atticPlan3Fixture as unknown as VisualScenePlan,
    ).locations["attic-study"]!.dressingInstances;

    expect(version2Instances.map((instance) => instance.dressingId)).toEqual(openingIds);
    expect(version3Instances.map((instance) => instance.dressingId)).toEqual(openingIds);
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
    expect(conservatory?.dressingInstances).toHaveLength(10);
    expect(conservatory?.dressingInstances.every((instance) => instance.renderKind === "module"))
      .toBe(true);
    expect(recipe.fallbackEntityIds).toEqual(["orrery-1"]);
    expect(recipe.generationJobs[0]).toMatchObject({
      entityId: "orrery-1",
      strategy: "image_to_mesh",
      priority: "hero",
    });
  });

  it("keeps asset and module decisions stable while compiling the next passage", () => {
    const opening = conservatorySnapshotFixture as unknown as WorldSnapshot;
    const openingRecipe = compileSceneRecipe(
      opening,
      conservatoryPlan1Fixture as unknown as VisualScenePlan,
    );
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
    const openingDressing = openingRecipe.locations["moonlit-conservatory"]?.dressingInstances ?? [];
    const awakenedDressing = recipe.locations["moonlit-conservatory"]?.dressingInstances ?? [];
    expect(awakenedDressing.map((instance) => instance.dressingId))
      .toEqual(openingDressing.map((instance) => instance.dressingId));
    expect(awakenedDressing.find(
      (instance) =>
        instance.dressingId === "moonlit-conservatory:dressing:planters:northeast-planter",
    )?.placementStatus).toBe("preferred");
  });

  it("scales adaptive dressing counts from sparse to rich without changing facts", () => {
    const sparsePlan = structuredClone(
      conservatoryPlan1Fixture,
    ) as unknown as VisualScenePlan;
    sparsePlan.locations[0]!.dressingDensity = "sparse";

    const recipe = compileSceneRecipe(
      conservatorySnapshotFixture as unknown as WorldSnapshot,
      sparsePlan,
    );

    expect(recipe.locations["moonlit-conservatory"]?.dressingInstances).toHaveLength(4);
    expect(recipe.coverage).toMatchObject({ total: 5, approved: 4, designedFallback: 1 });
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
    expect(openingDressing).toHaveLength(23);
    expect(openingDressing.every((instance) => instance.decorativeOnly)).toBe(true);
    const approachDressing = openingDressing.filter(
      (instance) => instance.placementRegion === "approach",
    );
    expect(approachDressing).toHaveLength(18);
    expect(approachDressing.map((instance) => instance.renderKind === "asset" ? instance.catalogId : "module"))
      .toEqual(expect.arrayContaining([
        "kenney:nature-tree-oak-safe",
        "kenney:nature-bush-safe",
        "polyhaven:rock_face_01-optimized",
      ]));
    expect(openingDressing.filter((instance) => instance.renderKind === "asset").map((instance) => instance.catalogId)).toEqual(expect.arrayContaining([
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

    const remaining = recipe.locations["coaching-courtyard"]?.dressingInstances ?? [];
    expect(remaining).toHaveLength(18);
    expect(remaining.every((instance) => instance.placementRegion === "approach")).toBe(true);
    expect(remaining.some((instance) => instance.sourceTag === "courtyard-clutter")).toBe(false);
    expect(recipe.approvedAssets).toHaveLength(5);
  });

  it("removes approved exterior scenery when the visual plan drops its tags", () => {
    const planWithoutScenery = structuredClone(
      courtyardPlan1Fixture,
    ) as unknown as VisualScenePlan;
    const exteriorTags = new Set(["broadleaf-trees", "hedges", "verge-rocks"]);
    planWithoutScenery.locations[0]!.dressingTags = planWithoutScenery.locations[0]!.dressingTags
      .filter((tag) => !exteriorTags.has(tag));

    const recipe = compileSceneRecipe(
      courtyardSnapshotFixture as unknown as WorldSnapshot,
      planWithoutScenery,
    );

    const dressing = recipe.locations["coaching-courtyard"]?.dressingInstances ?? [];
    expect(dressing).toHaveLength(5);
    expect(dressing.every((instance) => instance.placementRegion === "interior")).toBe(true);
    expect(dressing.some(
      (instance) => instance.renderKind === "asset" && instance.registryKey.startsWith("environment-"),
    )).toBe(false);
  });

  it("builds a contrasting woodland entirely from approved semantic recipes", () => {
    const snapshot = woodlandSnapshotFixture as unknown as WorldSnapshot;
    const plan = woodlandPlanFixture as unknown as VisualScenePlan;
    const first = compileSceneRecipe(snapshot, plan);
    const repeated = compileSceneRecipe(snapshot, plan);
    const woodland = first.locations["mosswood-path"];
    const instances = woodland?.dressingInstances ?? [];

    expect(first.styleKit.id).toBe("woodland-storybook");
    expect(first.status).toBe("ready");
    expect(first.coverage).toMatchObject({ total: 4, approved: 4, approvedPercent: 100 });
    expect(instances.length).toBeGreaterThan(35);
    expect(instances.every(
      (instance) => instance.decorativeOnly && instance.placementRegion === "woodland",
    )).toBe(true);
    expect(instances.flatMap(
      (instance) => instance.renderKind === "asset" ? [instance.catalogId] : [],
    )).toEqual(expect.arrayContaining([
      "project:storybook-pine-tall-v1",
      "project:storybook-pine-layered-v1",
      "quaternius:birch-tree-01",
      "polyhaven:fern_02-optimized",
      "kenney:nature-grass-tuft-safe",
      "kenney:nature-red-mushrooms-safe",
      "kenney:nature-fallen-log-safe",
      "polyhaven:rock_face_01-optimized",
    ]));
    expect(repeated.locations["mosswood-path"]?.dressingInstances).toEqual(instances);
  });

  it("routes universal urban and industrial prose into optimized environment assets", () => {
    const snapshot = worldFamiliesFixture.initialSnapshot as unknown as WorldSnapshot;
    const plan = worldFamiliesFixture.moments[0]!.visualPlan as unknown as VisualScenePlan;
    const recipe = compileSceneRecipe(snapshot, plan);
    const marketAssets = recipe.locations["lantern-market"]?.dressingInstances
      .flatMap((instance) => instance.renderKind === "asset" ? [instance.catalogId] : []) ?? [];
    const marketLamps = recipe.locations["lantern-market"]?.dressingInstances
      .filter((instance) => instance.renderKind === "asset" && instance.registryKey === "ornate-street-lamp") ?? [];
    const engineAssets = recipe.locations["orbital-engine-room"]?.dressingInstances
      .flatMap((instance) => instance.renderKind === "asset" ? [instance.catalogId] : []) ?? [];
    const integratedRockLocations = [
      "sunken-dunes",
      "saltwind-coast",
      "prismatic-cavern",
      "coral-palace",
      "ember-caldera",
    ];

    expect(marketAssets).toContain("polyhaven:street_lamp_01-optimized");
    expect(marketLamps).toHaveLength(4);
    expect(marketLamps.every((lamp) => (
      Math.abs(lamp.position[0]) + lamp.dimensions[0] / 2 <= 22 * 0.32 &&
      Math.abs(lamp.position[2]) + lamp.dimensions[2] / 2 <= 34 / 2
    ))).toBe(true);
    expect(engineAssets).toContain("polyhaven:modular_industrial_pipes_01-optimized");
    for (const locationId of integratedRockLocations) {
      expect(recipe.locations[locationId]?.dressingInstances.some(
        (instance) => instance.sourceTag === "verge-rocks",
      )).toBe(false);
    }
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
