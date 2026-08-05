import { describe, expect, it } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import plan1Fixture from "../../fixtures/visual_scene_plan_1.json";
import plan3Fixture from "../../fixtures/visual_scene_plan_3.json";
import importedDemoFixture from "../../fixtures/story_package_import_demo.json";
import editableTemplateFixture from "../../fixtures/part1_story_package_template.json";
import {
  parseStoryPackageJson,
  runtimeStoryFromPackage,
  StoryPackageValidationError,
  validateStoryPackage,
} from "./storyPackage";
import { compileSceneRecipe } from "../runtime/sceneRecipeCompiler";

function validPackage() {
  return {
    schemaVersion: "1.0",
    packageId: "portable-attic",
    label: "Portable attic",
    initialSnapshot: snapshotFixture,
    moments: [
      {
        passageId: "P1",
        text: "The opening passage.",
        visualPlan: plan1Fixture,
      },
      {
        passageId: "P2",
        text: "The chair moves and a lantern appears.",
        patchFromPrevious: patch2Fixture,
        actionLabel: "Continue",
      },
      {
        passageId: "P3",
        text: "A hidden door is revealed.",
        patchFromPrevious: patch3Fixture,
        visualPlan: plan3Fixture,
      },
    ],
  };
}

describe("story package integration", () => {
  it("loads a portable package into the same runtime shape as built-in fixtures", () => {
    const runtime = runtimeStoryFromPackage(validPackage());

    expect(runtime).toMatchObject({
      id: "portable-attic",
      label: "Portable attic",
      passages: [
        "The opening passage.",
        "The chair moves and a lantern appears.",
        "A hidden door is revealed.",
      ],
      nextLabels: ["Continue", "Apply P3"],
    });
    expect(runtime.patches.map((patch) => patch.toVersion)).toEqual([2, 3]);
    expect(runtime.visualPlans.map((plan) => plan.planVersion)).toEqual([1, 2]);
  });

  it("accepts the data-only observatory import fixture", () => {
    const storyPackage = validateStoryPackage(importedDemoFixture);
    const runtime = runtimeStoryFromPackage(storyPackage);
    const recipe = compileSceneRecipe(runtime.snapshot, runtime.visualPlans[0]!);
    expect(runtime.id).toBe("imported-observatory-archive");
    expect(runtime.snapshot.storyId).toBe("story-observatory-archive");
    expect(runtime.visualPlans[0]?.locations[0]?.architectureTags).toContain("archive-shelving");
    expect(recipe.coverage.approved).toBe(5);
    expect(recipe.locations["observatory-archive"]?.environmentModules.map((module) => module.moduleId))
      .toContain("structure:archive-shelves");
  });

  it("accepts the editable Part 1 starter package as a clean import", () => {
    const storyPackage = validateStoryPackage(editableTemplateFixture);
    const runtime = runtimeStoryFromPackage(storyPackage);
    const recipe = compileSceneRecipe(runtime.snapshot, runtime.visualPlans[0]!);

    expect(runtime.id).toBe(storyPackage.packageId);
    expect(runtime.visualPlans[0]).toBeDefined();
    expect(recipe.composition.status).not.toBe("blocking");
  });

  it("permits a validated visual plan to carry forward across a factual-only passage", () => {
    const result = validateStoryPackage(validPackage());
    expect(result.moments[1]?.visualPlan).toBeUndefined();
    expect(result.moments[2]?.visualPlan?.previousPlanVersion).toBe(1);
  });

  it("rejects missing and out-of-order patch links", () => {
    const missingPatch = validPackage();
    delete missingPatch.moments[1]!.patchFromPrevious;
    expect(() => validateStoryPackage(missingPatch)).toThrow("later moment requires a patch");

    const wrongVersion = validPackage();
    wrongVersion.moments[1]!.patchFromPrevious = {
      ...patch2Fixture,
      fromVersion: 7,
      toVersion: 8,
    };
    expect(() => validateStoryPackage(wrongVersion)).toThrow("Cannot apply patch from version 7");
  });

  it("rejects visual entities that do not join the factual snapshot", () => {
    const invalid = validPackage();
    invalid.moments[0]!.visualPlan = {
      ...plan1Fixture,
      entities: [
        ...plan1Fixture.entities,
        {
          ...plan1Fixture.entities[0]!,
          entityId: "invented-story-object",
        },
      ],
    };

    expect(() => validateStoryPackage(invalid)).toThrow("is not canonical");
  });

  it("reports malformed JSON as a package error", () => {
    expect(() => parseStoryPackageJson('{ "schemaVersion": ')).toThrow(
      StoryPackageValidationError,
    );
    expect(() => parseStoryPackageJson('{ "schemaVersion": ')).toThrow("JSON:");
  });
});
