import { describe, expect, it } from "vitest";
import {
  compileGhibliWoodlandLayout,
  woodlandPathCenter,
  type GhibliWoodlandInput,
} from "./ghibliWoodlandKit";

const grove: GhibliWoodlandInput = {
  locationId: "sunbell-glade",
  bounds: [52, 10, 62],
  archetype: "sunlit broadleaf flower grove",
  visualDescription: "A warm glade of old oaks, buttercups and a winding woodland path.",
  mood: "hopeful and quietly enchanted",
  timeOfDay: "late morning",
  architectureTags: ["open-air", "forest-floor", "winding-path", "woodland-edge"],
  dressingTags: ["broadleaf-trees", "forest-undergrowth", "wildflowers", "forest-rocks"],
  dressingDensity: "rich",
  quality: "balanced",
};

describe("GhibliWoodlandKit grammar", () => {
  it("is deterministic for the same canonical location semantics", () => {
    expect(compileGhibliWoodlandLayout(grove)).toEqual(compileGhibliWoodlandLayout(grove));
  });

  it("varies composition for a different location without story-specific branching", () => {
    const first = compileGhibliWoodlandLayout(grove);
    const second = compileGhibliWoodlandLayout({
      ...grove,
      locationId: "rain-song-copse",
      visualDescription: "A rain-dark conifer trail under silver fog.",
      mood: "hushed and mysterious",
      timeOfDay: "blue dawn",
      dressingTags: ["pine-trees", "forest-undergrowth", "wild-mushrooms"],
    });

    expect(first.seed).not.toBe(second.seed);
    expect(first.mood).toBe("sunlit");
    expect(second.mood).toBe("misty");
    expect(first.trees).not.toEqual(second.trees);
  });

  it("keeps decorative trees out of the readable traversal corridor", () => {
    const result = compileGhibliWoodlandLayout(grove);
    for (const tree of result.trees) {
      const center = woodlandPathCenter(
        tree.position[2],
        grove.bounds,
        result.pathPhase,
        result.pathAmplitude,
      );
      expect(Math.abs(tree.position[0] - center)).toBeGreaterThan(result.pathWidth + 1.25);
    }
  });

  it("keeps presentation dressing stable when only narrative entities change", () => {
    const before = compileGhibliWoodlandLayout(grove);
    const afterPassagePatch = compileGhibliWoodlandLayout({ ...grove });
    expect(afterPassagePatch.seed).toBe(before.seed);
    expect(afterPassagePatch.trees).toEqual(before.trees);
    expect(afterPassagePatch.groundCover).toEqual(before.groundCover);
  });
});
