import { describe, expect, it } from "vitest";
import snapshotInput from "../../fixtures/snapshot_1.json";
import patchInput from "../../fixtures/patch_2.json";
import visualPlanInput from "../../fixtures/visual_scene_plan_1.json";
import {
  LivePart1StorySession,
  applyScenePatch,
  validateScenePatch,
  validateWorldSnapshot,
} from "../index";
import { adaptLivePart1ChapterResponse } from "../../Create UI Prototype for Hackathon/src/api/livePart1Api";
import type { Book, Chapter } from "../../Create UI Prototype for Hackathon/src/types";

describe("Member 1 live response in the Member 3 reader", () => {
  it("validates, compiles, and creates the inspector view without driving 3D placement", () => {
    const chapter: Chapter = {
      id: "P1",
      bookId: "story-attic-study",
      index: 1,
      title: "Opening",
      content: "An oak writing desk waits in the attic study.",
      processingStatus: "processing",
    };
    const nextChapter: Chapter = {
      id: "P2",
      bookId: "story-attic-study",
      index: 2,
      title: "Change",
      content: "The chair has moved and a lantern now waits by the desk.",
      processingStatus: "processing",
    };
    const book: Book = {
      id: "story-attic-study",
      title: "Live attic study",
      chapters: [chapter, nextChapter],
    };
    const session = new LivePart1StorySession("UI live adapter test");
    const result = adaptLivePart1ChapterResponse(
      book,
      chapter,
      {
        snapshot: snapshotInput,
        patch: null,
        conflicts: [],
        processing_summary: {
          entities_added: snapshotInput.entities.length,
          entities_moved: 0,
          entities_updated: 0,
        },
        visual_plan: visualPlanInput,
      },
      session,
    );

    expect(result.spatialSnapshot.storyId).toBe(book.id);
    expect(result.spatialSnapshot.version).toBe(1);
    expect(result.spatialPatch).toBeNull();
    expect(result.sceneRecipe.composition.status).not.toBe("blocking");
    expect(result.snapshot.entities).toHaveLength(snapshotInput.entities.length);
    expect(result.snapshot.entities.every(entity => entity.radius === 0)).toBe(true);
    expect(result.summary.addedEntityIds).toHaveLength(snapshotInput.entities.length);

    const nextSnapshot = applyScenePatch(
      validateWorldSnapshot(snapshotInput),
      validateScenePatch(patchInput),
    );
    nextSnapshot.passageId = "P2";
    const nextResult = adaptLivePart1ChapterResponse(
      book,
      nextChapter,
      {
        snapshot: nextSnapshot,
        patch: patchInput,
        conflicts: [],
        processing_summary: {
          entities_added: 1,
          entities_moved: 1,
          entities_updated: 0,
        },
      },
      session,
    );
    expect(nextResult.spatialSnapshot.version).toBe(2);
    expect(nextResult.spatialPatch?.fromVersion).toBe(1);
    expect(nextResult.visualPlan.planVersion).toBe(1);
    expect(nextResult.sceneRecipe.composition.status).not.toBe("blocking");
  });
});
