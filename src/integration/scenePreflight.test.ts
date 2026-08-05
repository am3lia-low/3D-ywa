import { describe, expect, it } from "vitest";
import { builtInStoryPackages } from "../data/builtInStories";
import {
  preflightStoryPackage,
  StoryPackageValidationError,
} from "./storyPackage";

describe("built-in scene preflight", () => {
  it.each(builtInStoryPackages.map((storyPackage) => [storyPackage.label, storyPackage] as const))(
    "%s has no blocking scene moment",
    (_label, storyPackage) => {
      const report = preflightStoryPackage(storyPackage);
      expect(report.moments).toHaveLength(storyPackage.moments.length);
      expect(report.moments.every((moment) => moment.score > 0)).toBe(true);
    },
  );

  it("rejects a story package before rendering when an on-relation misses its support", () => {
    const broken = structuredClone(builtInStoryPackages[3]);
    const lantern = broken.initialSnapshot.entities.find(
      (entity) => entity.id === "trail-lantern-1",
    );
    if (!lantern) throw new Error("Woodland fixture must contain trail-lantern-1.");
    lantern.transform = { position: [0, 0.43, 0] };

    expect(() => preflightStoryPackage(broken)).toThrow(StoryPackageValidationError);
    expect(() => preflightStoryPackage(broken)).toThrow(/broken_surface_relation/);
  });
});
