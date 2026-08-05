import { describe, expect, it } from "vitest";
import { createWallTrimSegments } from "./wallTrimLayout";

describe("wall trim layout", () => {
  it("terminates trim around doors and cabinets instead of intersecting them", () => {
    const segments = createWallTrimSegments(12, [
      { center: -3, width: 1.4 },
      { center: 2.5, width: 2 },
    ]);
    for (const obstacle of [{ center: -3, width: 1.4 }, { center: 2.5, width: 2 }]) {
      for (const segment of segments) {
        const separation = Math.abs(segment.center - obstacle.center);
        expect(separation).toBeGreaterThanOrEqual(segment.length / 2 + obstacle.width / 2 + 0.069);
      }
    }
    expect(segments).toHaveLength(3);
  });

  it("merges overlapping cutouts without creating slivers", () => {
    const segments = createWallTrimSegments(8, [
      { center: 0, width: 1.5 },
      { center: 0.8, width: 1.4 },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments.every((segment) => segment.length >= 0.08)).toBe(true);
  });
});
