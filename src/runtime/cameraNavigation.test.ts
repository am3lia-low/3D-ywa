import { describe, expect, it } from "vitest";
import {
  clampNavigationTarget,
  createExteriorNavigationLimits,
  createOverviewCameraPose,
  createExteriorPovCameraPose,
  createPovCameraPose,
  createTravelCameraPose,
  createWalkCameraPose,
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
    expect(pose.position[2]).toBeCloseTo(3.64);
    expect(pose.target[2]).toBeCloseTo(-3.36);
  });

  it("starts an exterior scene looking toward its open boundary", () => {
    const pose = createExteriorPovCameraPose([34, 6.5, 28]);

    expect(pose.position[1]).toBeCloseTo(1.68);
    expect(pose.target[2]).toBeGreaterThan(pose.position[2]);
    expect(Math.abs(pose.position[0])).toBeLessThan(17);
    expect(pose.target[2]).toBeLessThan(14);
  });

  it("extends outdoor walking through the open edge but not the rear wall", () => {
    const bounds: [number, number, number] = [34, 6.5, 28];
    const limits = createExteriorNavigationLimits(bounds);

    expect(clampNavigationTarget([0, 1.68, 999], bounds, limits)[2]).toBeCloseTo(63.85);
    expect(clampNavigationTarget([0, 1.68, -999], bounds, limits)[2]).toBeCloseTo(-13.45);
  });

  it("walks from a courtyard onto its rendered exterior approach", () => {
    const bounds: [number, number, number] = [34, 6.5, 28];
    const pose = createWalkCameraPose(
      [0, 1.68, 13],
      [0, 1.4, 14],
      { forward: true, backward: false, left: false, right: false },
      1,
      bounds,
      createExteriorNavigationLimits(bounds),
    );

    expect(pose.position[2]).toBeGreaterThan(bounds[2] / 2);
  });

  it("preserves view offset while travelling to a bounded target", () => {
    const pose = createTravelCameraPose([8, 7, 9], [0, 1, 0], [50, 1, 50], [12, 4.5, 10]);

    expect(pose.target).toEqual([5.45, 1, 4.45]);
    expect(pose.position[0] - pose.target[0]).toBeCloseTo(8);
    expect(pose.position[1] - pose.target[1]).toBeCloseTo(6);
    expect(pose.position[2] - pose.target[2]).toBeCloseTo(9);
  });

  it("walks relative to the view while keeping a standing eye height", () => {
    const pose = createWalkCameraPose(
      [0, 1.68, 4],
      [0, 1.3, 0],
      { forward: true, backward: false, left: false, right: true },
      1,
      [30, 6.8, 26],
    );

    expect(pose.position[0]).toBeGreaterThan(0);
    expect(pose.position[2]).toBeLessThan(4);
    expect(pose.position[1]).toBeCloseTo(1.68);
    expect(pose.target[1] - pose.position[1]).toBeCloseTo(1.3 - 1.68);
  });

  it("keeps walking inside the room footprint without jumping", () => {
    const pose = createWalkCameraPose(
      [14.3, 8, -12.3],
      [15.3, 8, -12.3],
      { forward: true, backward: false, left: false, right: false },
      5,
      [30, 6.8, 26],
    );

    expect(pose.position).toEqual([14.45, 1.68, -12.3]);
    expect(pose.target[0] - pose.position[0]).toBeCloseTo(1);
  });
});
