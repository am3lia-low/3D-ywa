import { describe, expect, it } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import plan1Fixture from "../../fixtures/visual_scene_plan_1.json";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import plan3Fixture from "../../fixtures/visual_scene_plan_3.json";
import conservatorySnapshotFixture from "../../fixtures/snapshot_conservatory_1.json";
import conservatoryPlanFixture from "../../fixtures/visual_scene_plan_conservatory_1.json";
import courtyardSnapshotFixture from "../../fixtures/snapshot_courtyard_1.json";
import courtyardPlanFixture from "../../fixtures/visual_scene_plan_courtyard_1.json";
import woodlandSnapshotFixture from "../../fixtures/snapshot_woodland_1.json";
import woodlandPlanFixture from "../../fixtures/visual_scene_plan_woodland_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch } from "./applyScenePatch";
import { sceneEnvironmentFamily } from "./sceneAtmosphere";
import {
  compileScenePresentation,
  createFallbackScenePresentation,
  ScenePlanError,
  visualAssetPrompt,
} from "./sceneCompiler";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const plan1 = plan1Fixture as unknown as VisualScenePlan;

describe("compileScenePresentation", () => {
  it("turns semantic attic context into renderer features", () => {
    const scene = compileScenePresentation(plan1, snapshot, "attic-study");

    expect(scene.styleLabel).toBe("hand-painted storybook realism");
    expect(scene.architecture).toMatchObject({
      floorboards: true,
      plasterWalls: true,
      timberFrame: true,
      window: true,
      archiveShelves: false,
    });
    expect(scene.dressing).toMatchObject({ books: true, storageCrates: true, travelChest: true });
    expect(scene.atmosphere.dust).toBe(true);
  });

  it("compiles a distinct archive treatment from the same plan", () => {
    const scene = compileScenePresentation(plan1, snapshot, "archive-vault");
    expect(scene.architecture.archiveShelves).toBe(true);
    expect(scene.architecture.floorboards).toBe(false);
    expect(scene.palette.background).toBe("#111a1b");
  });

  it("compiles the botanical glasshouse as a separate modular environment kit", () => {
    const scene = compileScenePresentation(
      conservatoryPlanFixture as unknown as VisualScenePlan,
      conservatorySnapshotFixture as unknown as WorldSnapshot,
      "moonlit-conservatory",
    );
    expect(scene.architecture).toMatchObject({
      glasshousePanels: true,
      ironFrame: true,
      stoneTileFloor: true,
      timberFrame: false,
      archiveShelves: false,
    });
    expect(scene.dressing).toMatchObject({ planters: true, climbingVines: true });
  });

  it("compiles an open-air courtyard without falling back to an interior shell", () => {
    const scene = compileScenePresentation(
      courtyardPlanFixture as unknown as VisualScenePlan,
      courtyardSnapshotFixture as unknown as WorldSnapshot,
      "coaching-courtyard",
    );

    expect(scene.modules.environment.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining([
        "shell:open-air",
        "surface:cobblestone",
        "structure:stone-arcade",
        "boundary:courtyard-wall",
      ]),
    );
    expect(scene.modules.environment.map((module) => module.moduleId)).not.toContain("shell:solid-room");
    expect(scene.architecture).toMatchObject({
      openAir: true,
      cobblestone: true,
      stoneArcade: true,
      courtyardWalls: true,
    });
    expect(scene.dressing).toMatchObject({
      rainPuddles: true,
      wallIvy: true,
      fallenLeaves: true,
      courtyardClutter: true,
      broadleafTrees: true,
      hedges: true,
      vergeRocks: true,
    });
    expect(scene.modules.dressing.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining([
        "dressing:broadleaf-trees",
        "dressing:hedges",
        "dressing:verge-rocks",
      ]),
    );
    expect(scene.atmosphere.rain).toBe(true);
  });

  it("compiles a misty woodland from the same open-air scene grammar", () => {
    const scene = compileScenePresentation(
      woodlandPlanFixture as unknown as VisualScenePlan,
      woodlandSnapshotFixture as unknown as WorldSnapshot,
      "mosswood-path",
    );

    expect(scene.modules.environment.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining([
        "shell:open-air",
        "surface:forest-floor",
        "path:earth-trail",
        "boundary:woodland-edge",
      ]),
    );
    expect(scene.modules.environment.map((module) => module.moduleId)).not.toContain("shell:solid-room");
    expect(scene.modules.dressing.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining([
        "dressing:pine-trees",
        "dressing:forest-undergrowth",
        "dressing:grass-tufts",
        "dressing:wild-mushrooms",
        "dressing:fallen-logs",
        "dressing:forest-rocks",
      ]),
    );
    expect(scene.architecture).toMatchObject({
      openAir: true,
      forestFloor: true,
      earthTrail: true,
      woodlandEdge: true,
      courtyardWalls: false,
    });
    expect(scene.atmosphere.groundMist).toBe(true);
  });

  it("maps unfamiliar natural-language setting terms onto the reusable woodland kit", () => {
    const sourceLocation = plan1.locations.find((location) => location.locationId === "attic-study");
    if (!sourceLocation) throw new Error("Fixture must contain attic-study.");
    const unexpectedPlan: VisualScenePlan = {
      ...plan1,
      locations: [{
        ...sourceLocation,
        archetype: "remote highland crossing",
        visualDescription: "A misty conifer forest trail climbing through wet boulders and fallen logs.",
        architectureTags: ["wilderness", "mountain crossing"],
        dressingTags: ["spruce", "fungi", "deadwood"],
        lighting: {
          ...sourceLocation.lighting,
          atmosphericEffects: ["low fog"],
        },
      }],
    };

    const scene = compileScenePresentation(unexpectedPlan, snapshot, "attic-study");
    const modules = scene.modules.environment.map((module) => module.moduleId);
    expect(modules).toEqual(expect.arrayContaining([
      "shell:open-air",
      "surface:forest-floor",
      "path:earth-trail",
      "boundary:woodland-edge",
    ]));
    expect(scene.modules.dressing.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining([
        "dressing:pine-trees",
        "dressing:wild-mushrooms",
        "dressing:fallen-logs",
      ]),
    );
    expect(scene.atmosphere.groundMist).toBe(true);
  });

  it("keeps unfamiliar indoor genres enclosed instead of guessing an exterior", () => {
    const sourceLocation = plan1.locations.find((location) => location.locationId === "attic-study");
    if (!sourceLocation) throw new Error("Fixture must contain attic-study.");
    const laboratoryPlan: VisualScenePlan = {
      ...plan1,
      locations: [{
        ...sourceLocation,
        archetype: "orbital research laboratory",
        visualDescription: "A sterile interior laboratory chamber with brushed metal consoles.",
        architectureTags: ["modular bulkheads"],
        dressingTags: ["scientific instruments"],
      }],
    };

    const scene = compileScenePresentation(laboratoryPlan, snapshot, "attic-study");
    expect(scene.modules.environment.map((module) => module.moduleId)).toContain("shell:solid-room");
    expect(scene.architecture.openAir).toBe(false);
    expect(scene.architecture.floorboards).toBe(false);
  });

  it.each([
    ["windswept alpine tundra", "A snowy frozen mountain pass beneath a glacier.", "surface:snow", "boundary:mountain-horizon", "alpine"],
    ["sun-baked badlands", "An arid desert canyon opening into a sea of dunes.", "surface:sand", "boundary:dune-horizon", "arid"],
    ["remote island shore", "A coastal beach above the rolling ocean.", "surface:coastal", "boundary:coastline", "coastal"],
    ["open countryside", "A broad meadow of rolling hills and grassland.", "surface:grassland", "boundary:rolling-hills", "grassland"],
    ["old city market", "A narrow urban street leading through a crowded marketplace.", "surface:urban-paving", "boundary:urban-skyline", "urban"],
    ["orbital engine room", "An industrial interior laboratory chamber aboard a space station.", "surface:industrial-floor", "shell:industrial", "industrial"],
  ])("routes unfamiliar %s prose into the %s family", (archetype, description, surfaceModule, boundaryModule, family) => {
    const sourceLocation = plan1.locations.find((location) => location.locationId === "attic-study");
    if (!sourceLocation) throw new Error("Fixture must contain attic-study.");
    const familyPlan: VisualScenePlan = {
      ...plan1,
      locations: [{
        ...sourceLocation,
        archetype,
        visualDescription: description,
        architectureTags: ["unfamiliar generated setting"],
        dressingTags: [],
        lighting: { ...sourceLocation.lighting, atmosphericEffects: [] },
      }],
    };
    const scene = compileScenePresentation(familyPlan, snapshot, "attic-study");
    const modules = scene.modules.environment.map((module) => module.moduleId);

    expect(modules).toContain(surfaceModule);
    expect(modules).toContain(boundaryModule);
    expect(sceneEnvironmentFamily(scene)).toBe(family);
    if (family === "industrial") {
      expect(modules).toContain("shell:solid-room");
      expect(scene.architecture.openAir).toBe(false);
    } else {
      expect(modules).toContain("shell:open-air");
    }
  });

  it("creates an atmospheric semantic fallback when no visual plan is available", () => {
    const forestSnapshot: WorldSnapshot = {
      ...snapshot,
      locations: snapshot.locations.map((location, index) =>
        index === 0 ? { ...location, name: "Whispering forest path" } : location,
      ),
    };
    const scene = createFallbackScenePresentation(forestSnapshot, "attic-study");

    expect(scene.styleLabel).toBe("polished storybook fallback");
    expect(scene.architecture).toMatchObject({
      openAir: true,
      forestFloor: true,
      earthTrail: true,
      woodlandEdge: true,
    });
  });

  it("emits an asset request for a supporting object without a registered asset key", () => {
    const scene = compileScenePresentation(plan1, snapshot, "attic-study");
    expect(scene.assetRequests.map((request) => request.entityId)).toContain("map-1");
  });

  it("preserves narrative object condition in generated-asset prompts", () => {
    const revealedPlan = plan3Fixture as unknown as VisualScenePlan;
    const lantern = revealedPlan.entities.find((entity) => entity.entityId === "lantern-1");
    if (!lantern) throw new Error("Fixture must contain lantern-1.");

    expect(visualAssetPrompt(lantern)).toContain("Condition: carried and unlit.");
  });

  it("rejects non-canonical visual identities", () => {
    const firstEntity = plan1.entities[0];
    if (!firstEntity) throw new Error("Fixture must contain a visual entity.");
    const invalid = {
      ...plan1,
      entities: [{ ...firstEntity, entityId: "invented-desk" }],
    };
    expect(() => compileScenePresentation(invalid, snapshot, "attic-study")).toThrow(
      ScenePlanError,
    );
  });

  it("unlocks the presentation-only portal only after the revealed plan version", () => {
    const version2 = applyScenePatch(snapshot, patch2Fixture as unknown as ScenePatch);
    const version3 = applyScenePatch(version2, patch3Fixture as unknown as ScenePatch);
    const scene = compileScenePresentation(
      plan3Fixture as unknown as VisualScenePlan,
      version3,
      "attic-study",
    );
    expect(scene.portalTargetLocationId).toBe("archive-vault");
  });
});
