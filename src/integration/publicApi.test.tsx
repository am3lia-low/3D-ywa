import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import snapshotInput from "../../fixtures/snapshot_1.json";
import patchInput from "../../fixtures/patch_2.json";
import visualPlanInput from "../../fixtures/visual_scene_plan_1.json";
import storyPackageInput from "../../fixtures/story_package_import_demo.json";
import unfamiliarStoryPackageInput from "../../fixtures/story_package_unfamiliar_demo.json";
import {
  OrderedWorldStream,
  applyScenePatch,
  compileSceneRecipe,
  preflightStoryPackage,
  runtimeStoryFromPackage,
  validateScenePatch,
  validateWorldSnapshot,
  type VisualScenePlan,
} from "../index";
import { Member3ConsumerHarness } from "./Member3ConsumerHarness";

describe("public spatial-runtime handoff", () => {
  it("loads and preflights a data-only story package through the public API", () => {
    const story = runtimeStoryFromPackage(storyPackageInput);
    const report = preflightStoryPackage(storyPackageInput);

    expect(story.id).toBe("imported-observatory-archive");
    expect(report.status).toBe("ready");
    expect(report.moments).toHaveLength(1);
    expect(report.moments[0]?.status).toBe("clean");
  });

  it("compiles an unfamiliar story into a coherent reusable environment", () => {
    const story = runtimeStoryFromPackage(unfamiliarStoryPackageInput);
    const plan = story.visualPlans[0];
    if (!plan) throw new Error("Stress-test package must include an opening visual plan.");
    const recipe = compileSceneRecipe(story.snapshot, plan);
    const location = recipe.locations["stormwatch-pass"];

    expect(location?.environmentModules.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining([
        "shell:open-air",
        "surface:forest-floor",
        "path:earth-trail",
        "boundary:woodland-edge",
      ]),
    );
    expect(recipe.coverage.designedFallback).toBeGreaterThan(0);
    expect(recipe.styleKit.id).toBe("woodland-storybook");
    expect(location?.dressingInstances.length).toBeGreaterThan(12);
    expect(recipe.composition.status).not.toBe("blocking");
  });

  it("orders, applies, and acknowledges a patch using only public exports", () => {
    const initialSnapshot = validateWorldSnapshot(snapshotInput);
    const patch = validateScenePatch(patchInput);
    const stream = new OrderedWorldStream(initialSnapshot);

    expect(stream.ingestPatch(patch)).toEqual({
      outcome: "accepted",
      expectedVersion: 2,
    });
    expect(stream.takeNextPatch()).toEqual(patch);

    const nextSnapshot = applyScenePatch(initialSnapshot, patch);
    stream.acknowledge(nextSnapshot, patch);

    expect(stream.currentSnapshot.version).toBe(2);
    expect(stream.pendingCount).toBe(0);
    expect(stream.status).toBe("ready");
  });

  it("compiles a recipe and server-renders the complete consumer wiring", () => {
    const snapshot = validateWorldSnapshot(snapshotInput);
    const visualPlan = visualPlanInput as VisualScenePlan;
    const recipe = compileSceneRecipe(snapshot, visualPlan);

    expect(recipe.storyId).toBe(snapshot.storyId);
    expect(recipe.composition.status).not.toBe("blocking");

    const markup = renderToStaticMarkup(
      createElement(Member3ConsumerHarness, {
        initialSnapshot: snapshot,
        initialVisualPlan: visualPlan,
        onPassageAdvance: vi.fn(),
        onLocationRequest: vi.fn(),
        onRuntimeError: vi.fn(),
      }),
    );

    expect(markup).toContain("reader-world");
  });
});
