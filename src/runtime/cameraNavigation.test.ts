import { describe, expect, it } from "vitest";
import {
  clampNavigationTarget,
  createOverviewCameraPose,
  createPovCameraPose,
  createTravelCameraPose,
} from "./cameraNavigation";

describe("camera navigation", () => {
  it("clamps map targets to the active room footprint", () => {
    expect(clampNavigationTarget([99, -4, -99], [8, 4, 6])).toEqual([3.45, 0.35, -2.45]);
  });

  it("scales the overview pose to differently sized rooms", () => {
    const small = createOverviewCameraPose([8, 4, 6]);
    const large = createOverviewCameraPose([16, 6, 12]);

    expect(large.position[0]).toBeGreaterThan(small.position[0]);
    expect(large.position[1]).toBeGreaterThan(small.position[1]);
    expect(large.position[2]).toBeGreaterThan(small.position[2]);
  });

  it("starts inside the room at human eye height", () => {
    const pose = createPovCameraPose([16, 5.6, 14]);

    expect(pose.position[1]).toBeCloseTo(1.68);
    expect(Math.abs(pose.position[0])).toBeLessThan(8);
    expect(Math.abs(pose.position[2])).toBeLessThan(7);
    expect(pose.target[2]).toBeLessThan(pose.position[2]);
    expect(pose.target[1]).toBeLessThan(pose.position[1]);
  });

  it("preserves view offset while travelling to a bounded target", () => {
    const pose = createTravelCameraPose([8, 7, 9], [0, 1, 0], [50, 1, 50], [12, 4.5, 10]);

    expect(pose.target).toEqual([5.45, 1, 4.45]);
    expect(pose.position[0] - pose.target[0]).toBeCloseTo(8);
    expect(pose.position[1] - pose.target[1]).toBeCloseTo(6);
    expect(pose.position[2] - pose.target[2]).toBeCloseTo(9);
  });
});
