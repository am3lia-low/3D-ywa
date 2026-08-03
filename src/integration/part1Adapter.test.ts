import { describe, expect, it } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import plan1Fixture from "../../fixtures/visual_scene_plan_1.json";
import plan3Fixture from "../../fixtures/visual_scene_plan_3.json";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch } from "../runtime/applyScenePatch";
import {
  LivePart1StorySession,
  Part1AdapterError,
  normalizePart1PassageResponse,
} from "./part1Adapter";

const opening = snapshotFixture as unknown as WorldSnapshot;
const patch2 = patch2Fixture as unknown as ScenePatch;
const patch3 = patch3Fixture as unknown as ScenePatch;
const snapshot2 = {
  ...applyScenePatch(opening, patch2),
  passageId: "P2",
};
const snapshot3 = {
  ...applyScenePatch(snapshot2, patch3),
  passageId: "P3",
};

describe("Part 1 live adapter", () => {
  it("normalizes the frozen API response plus its companion visual plan", () => {
    const response = normalizePart1PassageResponse({
      snapshot: opening,
      patch: null,
      conflicts: opening.conflicts,
      processing_summary: { entities_added: 2, entities_moved: 1, entities_updated: 3 },
      visual_scene_plan: plan1Fixture,
    });

    expect(response.snapshot.version).toBe(1);
    expect(response.patch).toBeUndefined();
    expect(response.visualPlan?.planVersion).toBe(1);
    expect(response.processingSummary).toEqual({
      entitiesAdded: 2,
      entitiesMoved: 1,
      entitiesUpdated: 3,
    });
  });

  it("turns sequential passage responses into one persistent runtime story", () => {
    const session = new LivePart1StorySession("Live attic");
    const first = session.ingest(
      { storyId: opening.storyId, passageId: "P1", text: "Opening" },
      { snapshot: opening, patch: null, visual_plan: plan1Fixture },
    );
    const second = session.ingest(
      { storyId: opening.storyId, passageId: "P2", text: "The chair moves." },
      { snapshot: snapshot2, patch: patch2, processing_summary: { entities_moved: 1 } },
    );
    const third = session.ingest(
      { storyId: opening.storyId, passageId: "P3", text: "The door appears." },
      { snapshot: snapshot3, patch: patch3, visualPlan: plan3Fixture },
    );

    expect(first.story.patches).toHaveLength(0);
    expect(second.story.patches).toHaveLength(1);
    expect(second.story.visualPlans).toHaveLength(1);
    expect(third.story.patches.map((patch) => patch.toVersion)).toEqual([2, 3]);
    expect(third.story.visualPlans.map((plan) => plan.planVersion)).toEqual([1, 2]);
    expect(third.story.passages).toEqual(["Opening", "The chair moves.", "The door appears."]);
    expect(third.authoritativeSnapshot.version).toBe(3);
  });

  it("requires grounded visual context to open a live world", () => {
    const session = new LivePart1StorySession();
    expect(() => session.ingest(
      { storyId: opening.storyId, passageId: "P1", text: "Opening" },
      { snapshot: opening, patch: null },
    )).toThrow(Part1AdapterError);
    expect(() => session.ingest(
      { storyId: opening.storyId, passageId: "P1", text: "Opening" },
      { snapshot: opening, patch: null },
    )).toThrow("must include visual_plan");
  });

  it("rejects a patch that cannot reproduce the authoritative snapshot", () => {
    const session = new LivePart1StorySession();
    session.ingest(
      { storyId: opening.storyId, passageId: "P1", text: "Opening" },
      { snapshot: opening, visual_plan: plan1Fixture },
    );
    const contradicted = {
      ...snapshot2,
      entities: snapshot2.entities.map((entity) =>
        entity.id === "desk-1" ? { ...entity, name: "Contradictory replacement desk" } : entity,
      ),
    };

    expect(() => session.ingest(
      { storyId: opening.storyId, passageId: "P2", text: "Next" },
      { snapshot: contradicted, patch: patch2 },
    )).toThrow("does not reproduce the supplied snapshot");
    expect(session.story?.patches).toHaveLength(0);
  });

  it("rejects cross-story and cross-passage responses", () => {
    const session = new LivePart1StorySession();
    expect(() => session.ingest(
      { storyId: "different-story", passageId: "P1", text: "Opening" },
      { snapshot: opening, visual_plan: plan1Fixture },
    )).toThrow("does not match 'different-story'");

    expect(() => new LivePart1StorySession().ingest(
      { storyId: opening.storyId, passageId: "WRONG", text: "Opening" },
      { snapshot: opening, visual_plan: plan1Fixture },
    )).toThrow("does not match 'WRONG'");
  });
});
