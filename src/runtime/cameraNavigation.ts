import type { Vector3Tuple } from "../contracts/world";

const DEFAULT_BOUNDS: Vector3Tuple = [12, 4.5, 10];
const EDGE_MARGIN = 0.55;

export interface CameraPose {
  position: Vector3Tuple;
  target: Vector3Tuple;
}

/** Places the reader inside the world at a natural standing eye height. */
export function createPovCameraPose(
  bounds: Vector3Tuple = DEFAULT_BOUNDS,
): CameraPose {
  const eyeHeight = Math.min(1.68, Math.max(1.5, bounds[1] * 0.34));
  return {
    position: [bounds[0] * 0.16, eyeHeight, bounds[2] * 0.34],
    target: [0, Math.min(1.32, eyeHeight - 0.18), -bounds[2] * 0.17],
  };
}

/** Keeps the navigated point inside the walkable footprint of a room. */
export function clampNavigationTarget(
  target: Vector3Tuple,
  bounds: Vector3Tuple = DEFAULT_BOUNDS,
): Vector3Tuple {
  const halfWidth = Math.max(0, bounds[0] / 2 - EDGE_MARGIN);
  const halfDepth = Math.max(0, bounds[2] / 2 - EDGE_MARGIN);
  return [
    Math.min(Math.max(target[0], -halfWidth), halfWidth),
    Math.min(Math.max(target[1], 0.35), Math.max(0.35, bounds[1] - 0.35)),
    Math.min(Math.max(target[2], -halfDepth), halfDepth),
  ];
}

/** Produces a stable overview pose scaled to the active room. */
export function createOverviewCameraPose(
  bounds: Vector3Tuple = DEFAULT_BOUNDS,
): CameraPose {
  const roomSpan = Math.max(bounds[0], bounds[2]);
  const target: Vector3Tuple = [0, Math.min(bounds[1] * 0.28, 1.25), 0];
  return {
    target,
    position: [roomSpan * 0.58, Math.max(bounds[1] + 1.45, 5.35), roomSpan * 0.64],
  };
}

/** Moves the camera and its target together, preserving the current view angle. */
export function createTravelCameraPose(
  cameraPosition: Vector3Tuple,
  currentTarget: Vector3Tuple,
  requestedTarget: Vector3Tuple,
  bounds: Vector3Tuple = DEFAULT_BOUNDS,
): CameraPose {
  const target = clampNavigationTarget(requestedTarget, bounds);
  return {
    target,
    position: [
      target[0] + cameraPosition[0] - currentTarget[0],
      target[1] + cameraPosition[1] - currentTarget[1],
      target[2] + cameraPosition[2] - currentTarget[2],
    ],
  };
}
