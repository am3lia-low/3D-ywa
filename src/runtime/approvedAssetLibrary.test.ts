import { describe, expect, it } from "vitest";

import snapshotFixture from "../../fixtures/snapshot_1.json";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import visualPlan1Fixture from "../../fixtures/visual_scene_plan_1.json";
import visualPlan3Fixture from "../../fixtures/visual_scene_plan_3.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch } from "./applyScenePatch";
import { resolveApprovedAssetLibrary, selectStoryStyleKit } from "./approvedAssetLibrary";

const snapshot = snapshotFixture as WorldSnapshot;
const patch2 = patch2Fixture as ScenePatch;
const patch3 = patch3Fixture as ScenePatch;
const plan1 = visualPlan1Fixture as VisualScenePlan;
const plan3 = visualPlan3Fixture as VisualScenePlan;

describe("approved asset library", () => {
  it("selects one coherent style kit from the story visual profile", () => {
    expect(selectStoryStyleKit(plan1).id).toBe("storybook-historical");
  });

  it("resolves the opening world entirely from approved assets", () => {
    const result = resolveApprovedAssetLibrary(snapshot, plan1);

    expect(result.unresolvedEntityIds).toEqual([]);
    expect(result.selections).toHaveLength(snapshot.entities.length);
    expect(result.selections.find((item) => item.entityId === "desk-1")).toMatchObject({
      catalogId: "polyhaven:wooden_table_02",
      reason: "canonical_asset_key",
      license: "CC0 1.0 Universal",
    });
    expect(result.selections.find((item) => item.entityId === "map-1")).toMatchObject({
      catalogId: "project:parchment-map-v1",
      reason: "semantic_match",
    });
  });

  it("keeps approved identities stable while patches add story entities", () => {
    const version2 = applyScenePatch(snapshot, patch2);
    const version3 = applyScenePatch(version2, patch3);
    const opening = resolveApprovedAssetLibrary(snapshot, plan1);
    const revealed = resolveApprovedAssetLibrary(version3, plan3);

    expect(revealed.selections.find((item) => item.entityId === "desk-1")?.catalogId)
      .toBe(opening.selections.find((item) => item.entityId === "desk-1")?.catalogId);
    expect(revealed.selections.find((item) => item.entityId === "lantern-1")?.catalogId)
      .toBe("project:brass-lantern-v2");
    expect(revealed.selections.find((item) => item.entityId === "hidden-door-1")?.catalogId)
      .toBe("project:hidden-oak-door-v1");
  });

  it("does not force an unrelated approved model onto an unsupported story object", () => {
    const unsupportedSnapshot: WorldSnapshot = {
      ...snapshot,
      entities: [{
        id: "clockwork-bird-1",
        name: "Clockwork messenger bird",
        kind: "automaton",
        locationId: "attic-study",
        provenance: { passageId: "P1", confidence: 0.94 },
      }],
      relations: [],
    };
    const unsupportedPlan: VisualScenePlan = {
      ...plan1,
      entities: [{
        entityId: "clockwork-bird-1",
        visualDescription: "A unique articulated clockwork messenger bird.",
        importance: "hero",
        materials: ["brass gears", "steel feathers"],
        colors: ["brass", "blue steel"],
        assetSearchTags: ["clockwork automaton bird"],
        evidence: { passageIds: ["P1"], confidence: 0.9, basis: "explicit_text" },
      }],
    };

    const result = resolveApprovedAssetLibrary(unsupportedSnapshot, unsupportedPlan);
    expect(result.selections).toEqual([]);
    expect(result.unresolvedEntityIds).toEqual(["clockwork-bird-1"]);
  });
});
