import type { Vector3Tuple } from "../contracts/world";

const DEFAULT_BOUNDS: Vector3Tuple = [12, 4.5, 10];
const EDGE_MARGIN = 0.55;

export interface CameraPose {
  position: Vector3Tuple;
  target: Vector3Tuple;
}

export interface WalkInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

export interface NavigationLimits {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Extends an outdoor scene through its open edge without opening the rear wall. */
export function createExteriorNavigationLimits(
  bounds: Vector3Tuple = DEFAULT_BOUNDS,
): NavigationLimits {
  return {
    minX: -bounds[0] / 2 + EDGE_MARGIN,
    maxX: bounds[0] / 2 - EDGE_MARGIN,
    minZ: -bounds[2] / 2 + EDGE_MARGIN,
    maxZ: bounds[2] * 2.3 - EDGE_MARGIN,
  };
}

/** Places the reader inside the world at a natural standing eye height. */
export function createPovCameraPose(
  bounds: Vector3Tuple = DEFAULT_BOUNDS,
): CameraPose {
  const eyeHeight = Math.min(1.68, Math.max(1.5, bounds[1] * 0.34));
  return {
    position: [bounds[0] * 0.18, eyeHeight, bounds[2] * 0.03],
    target: [-bounds[0] * 0.08, Math.min(1.38, eyeHeight - 0.12), -bounds[2] * 0.37],
  };
}

/** Frames an open boundary immediately so outdoor scenes do not read as roofless rooms. */
export function createExteriorPovCameraPose(
  bounds: Vector3Tuple = DEFAULT_BOUNDS,
): CameraPose {
  const eyeHeight = Math.min(1.68, Math.max(1.5, bounds[1] * 0.34));
  return {
    position: [-bounds[0] * 0.2, eyeHeight, -bounds[2] * 0.2],
    target: [bounds[0] * 0.04, Math.min(1.3, eyeHeight - 0.18), bounds[2] * 0.48],
  };
}

/** Keeps the navigated point inside the walkable footprint of a room. */
export function clampNavigationTarget(
  target: Vector3Tuple,
  bounds: Vector3Tuple = DEFAULT_BOUNDS,
  limits?: NavigationLimits,
): Vector3Tuple {
  const halfWidth = Math.max(0, bounds[0] / 2 - EDGE_MARGIN);
  const halfDepth = Math.max(0, bounds[2] / 2 - EDGE_MARGIN);
  const resolvedLimits = limits ?? {
    minX: -halfWidth,
    maxX: halfWidth,
    minZ: -halfDepth,
    maxZ: halfDepth,
  };
  return [
    Math.min(Math.max(target[0], resolvedLimits.minX), resolvedLimits.maxX),
    Math.min(Math.max(target[1], 0.35), Math.max(0.35, bounds[1] - 0.35)),
    Math.min(Math.max(target[2], resolvedLimits.minZ), resolvedLimits.maxZ),
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
    position: [
      roomSpan * 0.62,
      Math.max(bounds[1] + 1.45, roomSpan * 0.62),
      roomSpan * 0.68,
    ],
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

/** Frames a selected object from the room side of its nearest wall. */
export function createFocusCameraPose(
  requestedTarget: Vector3Tuple,
  bounds: Vector3Tuple = DEFAULT_BOUNDS,
  objectDimensions?: Vector3Tuple,
): CameraPose {
  const target = clampNavigationTarget(requestedTarget, bounds);
  const halfX = bounds[0] / 2;
  const halfZ = bounds[2] / 2;
  const nearestWall = [
    { wall: "west" as const, distance: target[0] + halfX },
    { wall: "east" as const, distance: halfX - target[0] },
    { wall: "north" as const, distance: target[2] + halfZ },
    { wall: "south" as const, distance: halfZ - target[2] },
  ].sort((left, right) => left.distance - right.distance)[0]!.wall;
  const objectSpan = objectDimensions ? Math.max(...objectDimensions) : undefined;
  const defaultStandOff = Math.min(4.2, Math.max(2.8, Math.min(bounds[0], bounds[2]) * 0.16));
  const standOff = objectSpan !== undefined && objectSpan < 0.7
    ? Math.max(1.35, objectSpan * 3.2)
    : defaultStandOff;
  const eyeY = Math.min(bounds[1] - 0.5, Math.max(1.58, target[1] + 0.48));
  const requestedPosition: Vector3Tuple = nearestWall === "north"
    ? [target[0], eyeY, target[2] + standOff]
    : nearestWall === "south"
      ? [target[0], eyeY, target[2] - standOff]
      : nearestWall === "west"
        ? [target[0] + standOff, eyeY, target[2]]
        : [target[0] - standOff, eyeY, target[2]];

  return {
    target,
    position: clampNavigationTarget(requestedPosition, bounds),
  };
}

/** Advances a standing camera across the floor without adding vertical movement. */
export function createWalkCameraPose(
  cameraPosition: Vector3Tuple,
  currentTarget: Vector3Tuple,
  input: WalkInput,
  deltaSeconds: number,
  bounds: Vector3Tuple = DEFAULT_BOUNDS,
  navigationLimits?: NavigationLimits,
  speedMetersPerSecond = 4.2,
): CameraPose {
  const forwardX = currentTarget[0] - cameraPosition[0];
  const forwardZ = currentTarget[2] - cameraPosition[2];
  const forwardLength = Math.hypot(forwardX, forwardZ) || 1;
  const facingX = forwardX / forwardLength;
  const facingZ = forwardZ / forwardLength;
  const forwardAxis = Number(input.forward) - Number(input.backward);
  const rightAxis = Number(input.right) - Number(input.left);
  let moveX = facingX * forwardAxis - facingZ * rightAxis;
  let moveZ = facingZ * forwardAxis + facingX * rightAxis;
  const moveLength = Math.hypot(moveX, moveZ);
  if (moveLength > 0) {
    moveX /= moveLength;
    moveZ /= moveLength;
  }

  const distance = Math.max(0, deltaSeconds) * speedMetersPerSecond;
  const requestedPosition: Vector3Tuple = [
    cameraPosition[0] + moveX * distance,
    cameraPosition[1],
    cameraPosition[2] + moveZ * distance,
  ];
  const clamped = clampNavigationTarget(requestedPosition, bounds, navigationLimits);
  const eyeHeight = Math.min(1.68, Math.max(1.5, bounds[1] * 0.34));
  const offsetX = clamped[0] - cameraPosition[0];
  const offsetZ = clamped[2] - cameraPosition[2];

  return {
    position: [clamped[0], eyeHeight, clamped[2]],
    target: [
      currentTarget[0] + offsetX,
      currentTarget[1] + eyeHeight - cameraPosition[1],
      currentTarget[2] + offsetZ,
    ],
  };
}
