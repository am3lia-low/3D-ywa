import type { Vector3Tuple } from "../contracts/world";

export const SUPPORT_CONTACT_GAP = 0.008;

export interface SupportBox {
  position: Vector3Tuple;
  dimensions: Vector3Tuple;
  rotation?: Vector3Tuple;
  scale?: Vector3Tuple;
  /** Normalized height of the usable plane measured from the model bottom. */
  supportSurfaceY?: number;
}

export function scaledBoxDimensions(
  dimensions: Vector3Tuple,
  scale: Vector3Tuple = [1, 1, 1],
): Vector3Tuple {
  return dimensions.map((value, axis) => value * scale[axis]!) as Vector3Tuple;
}

export function boxBottomY(box: Pick<SupportBox, "position" | "dimensions" | "scale">): number {
  return box.position[1] - scaledBoxDimensions(box.dimensions, box.scale)[1] / 2;
}

export function supportPlaneWorldY(box: SupportBox): number {
  const height = scaledBoxDimensions(box.dimensions, box.scale)[1];
  return box.position[1] - height / 2 + height * (box.supportSurfaceY ?? 1);
}

export function centerYForSurfaceContact(
  surfaceY: number,
  dimensions: Vector3Tuple,
  scale: Vector3Tuple = [1, 1, 1],
  gap = SUPPORT_CONTACT_GAP,
): number {
  return surfaceY + scaledBoxDimensions(dimensions, scale)[1] / 2 + gap;
}

/** Half extents of a box measured in a support's local X/Z frame. */
export function localFootprintHalfExtents(
  dimensions: Vector3Tuple,
  relativeYaw: number,
  scale: Vector3Tuple = [1, 1, 1],
): [number, number] {
  const scaled = scaledBoxDimensions(dimensions, scale);
  const cosine = Math.abs(Math.cos(relativeYaw));
  const sine = Math.abs(Math.sin(relativeYaw));
  return [
    cosine * scaled[0] / 2 + sine * scaled[2] / 2,
    sine * scaled[0] / 2 + cosine * scaled[2] / 2,
  ];
}

export function worldToSupportLocal(
  position: Vector3Tuple,
  supportPosition: Vector3Tuple,
  supportYaw: number,
): [number, number] {
  const deltaX = position[0] - supportPosition[0];
  const deltaZ = position[2] - supportPosition[2];
  return [
    deltaX * Math.cos(supportYaw) - deltaZ * Math.sin(supportYaw),
    deltaX * Math.sin(supportYaw) + deltaZ * Math.cos(supportYaw),
  ];
}

export function supportLocalToWorld(
  local: [number, number],
  supportPosition: Vector3Tuple,
  supportYaw: number,
): [number, number] {
  return [
    supportPosition[0] + local[0] * Math.cos(supportYaw) + local[1] * Math.sin(supportYaw),
    supportPosition[2] - local[0] * Math.sin(supportYaw) + local[1] * Math.cos(supportYaw),
  ];
}

export function supportLocalReach(
  supportDimensions: Vector3Tuple,
  subjectDimensions: Vector3Tuple,
  relativeYaw: number,
  margin = 0.035,
  supportScale: Vector3Tuple = [1, 1, 1],
  subjectScale: Vector3Tuple = [1, 1, 1],
): [number, number] {
  const support = scaledBoxDimensions(supportDimensions, supportScale);
  const [subjectHalfX, subjectHalfZ] = localFootprintHalfExtents(
    subjectDimensions,
    relativeYaw,
    subjectScale,
  );
  return [
    Math.max(0, support[0] / 2 - subjectHalfX - margin),
    Math.max(0, support[2] / 2 - subjectHalfZ - margin),
  ];
}

export function boxRestsOnSupport(
  subject: SupportBox,
  support: SupportBox,
  options: { contactGap?: number; contactTolerance?: number; margin?: number } = {},
): boolean {
  const supportYaw = support.rotation?.[1] ?? 0;
  const subjectYaw = subject.rotation?.[1] ?? 0;
  const expectedBottom = supportPlaneWorldY(support) + (options.contactGap ?? SUPPORT_CONTACT_GAP);
  if (Math.abs(boxBottomY(subject) - expectedBottom) > (options.contactTolerance ?? 0.065)) {
    return false;
  }

  const [localX, localZ] = worldToSupportLocal(subject.position, support.position, supportYaw);
  const [reachX, reachZ] = supportLocalReach(
    support.dimensions,
    subject.dimensions,
    subjectYaw - supportYaw,
    options.margin ?? 0.035,
    support.scale,
    subject.scale,
  );
  return Math.abs(localX) <= reachX && Math.abs(localZ) <= reachZ;
}
