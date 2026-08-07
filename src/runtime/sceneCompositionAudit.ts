import type { SpatialRelation, Vector3Tuple, WorldSnapshot } from "../contracts/world";
import type { AssetRegistry } from "./assetRegistry";
import {
  URBAN_GUTTER_CENTER_FACTOR,
  URBAN_GUTTER_RESERVED_WIDTH,
  urbanFacadeInnerEdge,
  type ResolvedDressingInstance,
} from "./dressingResolver";
import {
  createWorldLayout,
  supportSurfaceWorldY,
  type LayoutItem,
  type WorldLayout,
} from "./layoutEngine";
import type { ScenePresentation } from "./sceneCompiler";
import {
  boxBottomY,
  boxRestsOnSupport,
  localFootprintHalfExtents,
  scaledBoxDimensions,
  supportPlaneWorldY,
  worldToSupportLocal,
} from "./supportSurfaces";
import { urbanWalkableSurfaceTop } from "./urbanComposition";

export type CompositionIssueCode =
  | "entity_overlap"
  | "blocked_access"
  | "floating_entity"
  | "facing_mismatch"
  | "broken_surface_relation"
  | "unmeasured_support_surface"
  | "implausible_scale"
  | "underdressed_location"
  | "dressing_overlap"
  | "duplicate_dressing"
  | "floating_dressing"
  | "broken_dressing_support"
  | "broken_wall_anchor"
  | "urban_facade_overlap"
  | "urban_gutter_overlap";

export interface CompositionIssue {
  id: string;
  code: CompositionIssueCode;
  severity: "warning" | "error";
  locationId: string;
  entityIds: string[];
  message: string;
}

export interface LocationCompositionAudit {
  locationId: string;
  status: "clean" | "review" | "blocking";
  score: number;
  issues: CompositionIssue[];
  entityCount: number;
  decorativeModuleCount: number;
}

export interface SceneCompositionAudit {
  status: "clean" | "review" | "blocking";
  score: number;
  warningCount: number;
  errorCount: number;
  locations: Readonly<Record<string, LocationCompositionAudit>>;
}

const FLOOR_EPSILON = 0.14;
const DRESSING_CONTACT_EPSILON = 0.07;
const DUPLICATE_POSITION_EPSILON = 0.12;

interface CompositionVolume {
  id: string;
  label: string;
  position: Vector3Tuple;
  dimensions: Vector3Tuple;
  yaw: number;
  floorLayer: boolean;
}

function effectiveDimensions(item: LayoutItem): Vector3Tuple {
  return scaledBoxDimensions(item.dimensions, item.scale);
}

function overlaps(left: LayoutItem, right: LayoutItem, padding = 0.04): boolean {
  const leftDimensions = effectiveDimensions(left);
  const rightDimensions = effectiveDimensions(right);
  return (
    Math.abs(left.position[0] - right.position[0]) <
      (leftDimensions[0] + rightDimensions[0]) / 2 + padding &&
    Math.abs(left.position[1] - right.position[1]) <
      (leftDimensions[1] + rightDimensions[1]) / 2 + padding &&
    Math.abs(left.position[2] - right.position[2]) <
      (leftDimensions[2] + rightDimensions[2]) / 2 + padding
  );
}

function rotatedDimensions(dimensions: Vector3Tuple, yaw: number): Vector3Tuple {
  const cosine = Math.abs(Math.cos(yaw));
  const sine = Math.abs(Math.sin(yaw));
  return [
    dimensions[0] * cosine + dimensions[2] * sine,
    dimensions[1],
    dimensions[0] * sine + dimensions[2] * cosine,
  ];
}

function volumeOverlaps(
  left: CompositionVolume,
  right: CompositionVolume,
  padding = 0.025,
): boolean {
  const leftDimensions = rotatedDimensions(left.dimensions, left.yaw);
  const rightDimensions = rotatedDimensions(right.dimensions, right.yaw);
  return (
    Math.abs(left.position[0] - right.position[0]) <
      (leftDimensions[0] + rightDimensions[0]) / 2 + padding &&
    Math.abs(left.position[1] - right.position[1]) <
      (leftDimensions[1] + rightDimensions[1]) / 2 + padding / 2 &&
    Math.abs(left.position[2] - right.position[2]) <
      (leftDimensions[2] + rightDimensions[2]) / 2 + padding
  );
}

function layoutVolume(item: LayoutItem): CompositionVolume {
  const dimensions = effectiveDimensions(item);
  return {
    id: item.entity.id,
    label: item.entity.name,
    position: item.position,
    dimensions,
    yaw: item.rotation[1],
    floorLayer: item.entity.kind === "decor" && dimensions[1] <= 0.16,
  };
}

function dressingVolume(instance: ResolvedDressingInstance): CompositionVolume {
  return {
    id: instance.dressingId,
    label: instance.dressingId.split(":").at(-1)?.replaceAll("-", " ") ?? "dressing",
    position: instance.position,
    dimensions: instance.dimensions,
    yaw: instance.rotation[1],
    floorLayer: instance.placementAnchor === "floor" && instance.dimensions[1] <= 0.16,
  };
}

function dressingAssetKey(instance: ResolvedDressingInstance): string {
  return instance.renderKind === "asset"
    ? instance.registryKey
    : `module:${instance.moduleKey}`;
}

function dressingRestsOnSupport(
  subject: ResolvedDressingInstance,
  target: LayoutItem | ResolvedDressingInstance,
): boolean {
  const targetBox = "entity" in target
    ? {
        position: target.position,
        dimensions: target.dimensions,
        rotation: target.rotation,
        scale: target.scale,
        supportSurfaceY: target.asset.supportSurfaceY,
      }
    : {
        position: target.position,
        dimensions: target.dimensions,
        rotation: target.rotation,
        supportSurfaceY: target.renderKind === "asset" ? target.asset.supportSurfaceY : undefined,
      };
  return boxRestsOnSupport(
    { position: subject.position, dimensions: subject.dimensions, rotation: subject.rotation },
    targetBox,
    { contactTolerance: DRESSING_CONTACT_EPSILON },
  );
}

function isFloorLayer(item: LayoutItem): boolean {
  return item.entity.kind === "decor" && effectiveDimensions(item)[1] <= 0.16;
}

function hasIrregularSupportSurface(item: LayoutItem): boolean {
  const semantics = [
    item.entity.kind,
    item.entity.name,
    item.asset.key,
    ...(item.entity.aliases ?? []),
  ].join(" ").toLowerCase();
  return /\b(log|trunk|stump|rock|boulder|barrel)\b/.test(semantics);
}

function isWallMounted(item: LayoutItem): boolean {
  const semantics = [
    item.entity.kind,
    item.entity.name,
    item.asset.key,
    ...(item.entity.aliases ?? []),
  ].join(" ").toLowerCase();
  return /\b(portrait|painting|picture|photograph|frame|mirror|wall[- ]?art|sconce)\b/.test(semantics);
}

function restsOnSurface(subject: LayoutItem, target: LayoutItem): boolean {
  const subjectDimensions = effectiveDimensions(subject);
  const targetDimensions = effectiveDimensions(target);
  const supportRatio = subject.entity.state?.supportSurfaceRatio;
  const expectedSupportY = supportPlaneWorldY({
    position: target.position,
    dimensions: target.dimensions,
    rotation: target.rotation,
    scale: target.scale,
    supportSurfaceY: typeof supportRatio === "number"
      ? Math.min(Math.max(supportRatio, 0), 1)
      : target.asset.supportSurfaceY,
  });
  const expectedBottom = expectedSupportY + 0.008;
  const subjectBottom = boxBottomY({
    position: subject.position,
    dimensions: subject.dimensions,
    scale: subject.scale,
  });
  if (Math.abs(subjectBottom - expectedBottom) > 0.065) return false;

  const targetYaw = target.rotation[1];
  const [localX, localZ] = worldToSupportLocal(subject.position, target.position, targetYaw);
  const relativeYaw = subject.rotation[1] - targetYaw;
  const [subjectHalfX, subjectHalfZ] = localFootprintHalfExtents(
    subject.dimensions,
    relativeYaw,
    subject.scale,
  );
  let reachX = Math.max(0, targetDimensions[0] / 2 - subjectHalfX - 0.025);
  let reachZ = Math.max(0, targetDimensions[2] / 2 - subjectHalfZ - 0.025);

  const subjectSemantics = `${subject.entity.kind} ${subject.entity.name} ${subject.asset.key}`.toLowerCase();
  const targetSemantics = `${target.entity.kind} ${target.entity.name} ${target.asset.key}`.toLowerCase();
  if (
    /\b(map|paper|parchment|document|letter|chart)\b/.test(subjectSemantics) &&
    /\b(window|sill|ledge)\b/.test(targetSemantics)
  ) {
    // Thin paper can safely overhang a narrow sill while still having most of
    // its centre of mass above the architectural support.
    return (
      Math.abs(localX) <= targetDimensions[0] / 2 + 0.015 &&
      Math.abs(localZ) <= targetDimensions[2] / 2 + subjectHalfZ * 0.55
    );
  }

  if (hasIrregularSupportSurface(target)) {
    reachX = Math.min(reachX, targetDimensions[0] * 0.16);
    reachZ = Math.min(reachZ, targetDimensions[2] * 0.16);
  }

  return Math.abs(localX) <= reachX + 0.015 && Math.abs(localZ) <= reachZ + 0.015;
}

function supportedPairs(relations: readonly SpatialRelation[]): Set<string> {
  return new Set(
    relations.flatMap((relation) =>
      relation.objectId && (relation.predicate === "on" || relation.predicate === "inside")
        ? [pairKey(relation.subjectId, relation.objectId)]
        : [],
    ),
  );
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join(":");
}

function issue(
  code: CompositionIssueCode,
  severity: CompositionIssue["severity"],
  locationId: string,
  entityIds: string[],
  message: string,
): CompositionIssue {
  return {
    id: `${locationId}:${code}:${[...entityIds].sort().join(":") || "location"}`,
    code,
    severity,
    locationId,
    entityIds,
    message,
  };
}

function accessPoint(
  item: LayoutItem,
  wall: "north" | "south" | "east" | "west" | undefined,
): Vector3Tuple {
  const offset = 1.05;
  if (wall === "south") return [item.position[0], 0.9, item.position[2] - offset];
  if (wall === "east") return [item.position[0] - offset, 0.9, item.position[2]];
  if (wall === "west") return [item.position[0] + offset, 0.9, item.position[2]];
  return [item.position[0], 0.9, item.position[2] + offset];
}

function blocksAccess(item: LayoutItem, point: Vector3Tuple, door: LayoutItem): boolean {
  if (isFloorLayer(item)) return false;
  const itemDimensions = effectiveDimensions(item);
  const doorDimensions = effectiveDimensions(door);
  const alongX = Math.abs(point[0] - item.position[0]) < (doorDimensions[0] + itemDimensions[0]) / 2 + 0.35;
  const alongZ = Math.abs(point[2] - item.position[2]) < (1.35 + itemDimensions[2]) / 2;
  return alongX && alongZ;
}

function dressingBlocksAccess(
  instance: ResolvedDressingInstance,
  point: Vector3Tuple,
  door: LayoutItem,
): boolean {
  if (instance.placementAnchor !== "floor" || instance.dimensions[1] <= 0.18) return false;
  const dimensions = rotatedDimensions(instance.dimensions, instance.rotation[1]);
  const doorDimensions = effectiveDimensions(door);
  const alongX = Math.abs(point[0] - instance.position[0]) <
    (doorDimensions[0] + dimensions[0]) / 2 + 0.35;
  const alongZ = Math.abs(point[2] - instance.position[2]) <
    (1.35 + dimensions[2]) / 2;
  return alongX && alongZ;
}

function auditLocation(
  snapshot: WorldSnapshot,
  layout: WorldLayout,
  presentation: ScenePresentation,
  dressingInstances: readonly ResolvedDressingInstance[],
): LocationCompositionAudit {
  const locationId = layout.location.id;
  const bounds = layout.location.bounds ?? [12, 4.5, 10];
  const issues: CompositionIssue[] = [];
  const itemsById = new Map(layout.items.map((item) => [item.entity.id, item]));
  const relations = snapshot.relations.filter((relation) => {
    const item = itemsById.get(relation.subjectId);
    return item?.entity.locationId === locationId;
  });
  const supported = supportedPairs(relations);

  for (let leftIndex = 0; leftIndex < layout.items.length; leftIndex += 1) {
    const left = layout.items[leftIndex]!;
    const scaledDimensions = effectiveDimensions(left);
    const scaleExemptArchitecture = left.asset.proceduralModel === "canal" ||
      left.entity.kind === "architecture" && /\b(canal|river|road|street|path|bridge|wall|terrain|ground|floor)\b/i.test(
        `${left.entity.name} ${left.asset.key} ${left.asset.proceduralModel ?? ""}`,
      );
    if (!scaleExemptArchitecture && (
      scaledDimensions[0] > bounds[0] * 0.82 ||
      scaledDimensions[1] > bounds[1] * 0.95 ||
      scaledDimensions[2] > bounds[2] * 0.82
    )) {
      issues.push(issue(
        "implausible_scale",
        "error",
        locationId,
        [left.entity.id],
        `${left.entity.name} is too large for ${layout.location.name}.`,
      ));
    }
    const bottom = left.position[1] - scaledDimensions[1] / 2;
    const isSupported = relations.some(
      (relation) =>
        relation.subjectId === left.entity.id &&
        (relation.predicate === "on" || relation.predicate === "inside"),
    );
    if (
      !isSupported &&
      left.entity.kind !== "architecture" &&
      !isWallMounted(left) &&
      bottom > FLOOR_EPSILON
    ) {
      issues.push(issue(
        "floating_entity",
        "warning",
        locationId,
        [left.entity.id],
        `${left.entity.name} is ${bottom.toFixed(2)}m above its expected support.`,
      ));
    }

    for (let rightIndex = leftIndex + 1; rightIndex < layout.items.length; rightIndex += 1) {
      const right = layout.items[rightIndex]!;
      if (isFloorLayer(left) || isFloorLayer(right)) continue;
      if (supported.has(pairKey(left.entity.id, right.entity.id))) continue;
      if (overlaps(left, right)) {
        issues.push(issue(
          "entity_overlap",
          "error",
          locationId,
          [left.entity.id, right.entity.id],
          `${left.entity.name} overlaps ${right.entity.name}.`,
        ));
      }
    }
  }

  for (const relation of relations) {
    const subject = itemsById.get(relation.subjectId);
    const target = relation.objectId ? itemsById.get(relation.objectId) : undefined;
    if ((relation.predicate === "on" || relation.predicate === "inside") && !target) {
      issues.push(issue(
        "broken_surface_relation",
        "error",
        locationId,
        [relation.subjectId, ...(relation.objectId ? [relation.objectId] : [])],
        `The '${relation.predicate}' relation cannot resolve within this location.`,
      ));
    }
    if (relation.predicate === "on" && subject && target) {
      if (hasIrregularSupportSurface(target) && target.asset.supportSurfaceY === undefined) {
        issues.push(issue(
          "unmeasured_support_surface",
          "error",
          locationId,
          [subject.entity.id, target.entity.id],
          `${target.entity.name} has an irregular surface but no measured support height.`,
        ));
      } else if (!restsOnSurface(subject, target)) {
        const subjectBottom = subject.position[1] - effectiveDimensions(subject)[1] / 2;
        const requestedRatio = subject.entity.state?.supportSurfaceRatio;
        const targetDimensions = effectiveDimensions(target);
        const expectedSupport = typeof requestedRatio === "number"
          ? target.position[1] - targetDimensions[1] / 2 + targetDimensions[1] * Math.min(Math.max(requestedRatio, 0), 1)
          : supportSurfaceWorldY(target);
        issues.push(issue(
          "broken_surface_relation",
          "error",
          locationId,
          [subject.entity.id, target.entity.id],
          `${subject.entity.name} does not geometrically rest on ${target.entity.name} ` +
            `(bottom ${subjectBottom.toFixed(3)}m; support ${expectedSupport.toFixed(3)}m).`,
        ));
      }
    }
    if (
      subject?.entity.kind === "furniture" &&
      target &&
      ["near", "left_of", "right_of", "in_front_of", "behind"].includes(relation.predicate)
    ) {
      const directionX = target.position[0] - subject.position[0];
      const directionZ = target.position[2] - subject.position[2];
      const length = Math.hypot(directionX, directionZ);
      const facingX = Math.sin(subject.rotation[1]);
      const facingZ = Math.cos(subject.rotation[1]);
      const alignment = length > 0 ? (facingX * directionX + facingZ * directionZ) / length : 1;
      const evidence = `${subject.entity.provenance?.sentence ?? ""} ${JSON.stringify(subject.entity.state ?? {})}`;
      const explicitlyFacesRoom = /(?:angled|facing|turned)\s+(?:in)?toward(?:s)?\s+the\s+room/i.test(evidence);
      if (!explicitlyFacesRoom && alignment < 0.55) {
        issues.push(issue(
          "facing_mismatch",
          "warning",
          locationId,
          [subject.entity.id, target.entity.id],
          `${subject.entity.name} does not face ${target.entity.name}.`,
        ));
      }
    }
    if (subject && relation.predicate === "against_wall" && /\b(door|gate|portal|hatch)\b/i.test(subject.entity.name)) {
      const point = accessPoint(subject, relation.metadata?.wall);
      const blocker = layout.items.find(
        (candidate) =>
          candidate.entity.id !== subject.entity.id &&
          candidate.entity.state?.presentationOccluded !== true &&
          blocksAccess(candidate, point, subject),
      );
      if (blocker) {
        issues.push(issue(
          "blocked_access",
          "error",
          locationId,
          [subject.entity.id, blocker.entity.id],
          `${blocker.entity.name} blocks access to ${subject.entity.name}.`,
        ));
      }
    }
  }

  const canonicalVolumes = layout.items.map(layoutVolume);
  const dressingVolumes = dressingInstances.map(dressingVolume);
  const supportsById = new Map<string, LayoutItem | ResolvedDressingInstance>([
    ...layout.items.map((item): [string, LayoutItem] => [item.entity.id, item]),
    ...dressingInstances.map((instance): [string, ResolvedDressingInstance] => [instance.dressingId, instance]),
  ]);

  for (const instance of dressingInstances) {
    const volume = dressingVolume(instance);
    const bottom = boxBottomY({ position: instance.position, dimensions: instance.dimensions });
    const expectedFloor = presentation.architecture.urbanStreet
      ? urbanWalkableSurfaceTop(bounds[0], instance.position[0])
      : 0;
    const expectedContact = expectedFloor + (instance.verticalOffset ?? 0);
    if (instance.placementAnchor === "floor" && Math.abs(bottom - expectedContact) > 0.025) {
      issues.push(issue(
        "floating_dressing",
        "error",
        locationId,
        [instance.dressingId],
        `${volume.label} does not make contact with the floor.`,
      ));
    }

    if (instance.placementAnchor === "surface") {
      const target = instance.supportId ? supportsById.get(instance.supportId) : undefined;
      if (!target || !dressingRestsOnSupport(instance, target)) {
        issues.push(issue(
          "broken_dressing_support",
          "error",
          locationId,
          [instance.dressingId, ...(instance.supportId ? [instance.supportId] : [])],
          `${volume.label} is not safely contained by its requested support.`,
        ));
      }
    }

    if (instance.placementAnchor === "wall" && instance.wall) {
      const rotated = rotatedDimensions(instance.dimensions, instance.rotation[1]);
      const clearance = instance.wall === "west" || instance.wall === "east"
        ? bounds[0] / 2 - Math.abs(instance.position[0]) - rotated[0] / 2
        : bounds[2] / 2 - Math.abs(instance.position[2]) - rotated[2] / 2;
      if (clearance < -0.005 || clearance > 0.22) {
        issues.push(issue(
          "broken_wall_anchor",
          "error",
          locationId,
          [instance.dressingId],
          `${volume.label} is clipped into or detached from the ${instance.wall} wall.`,
        ));
      }
    }

    if (presentation.architecture.urbanStreet && instance.placementAnchor === "floor") {
      const rotated = rotatedDimensions(instance.dimensions, instance.rotation[1]);
      const outerEdge = Math.abs(instance.position[0]) + rotated[0] / 2;
      const facadeInnerEdge = urbanFacadeInnerEdge(bounds[0]);
      if (outerEdge > facadeInnerEdge + 0.005) {
        issues.push(issue(
          "urban_facade_overlap",
          "error",
          locationId,
          [instance.dressingId],
          `${volume.label} intrudes into the projecting urban facade band.`,
        ));
      }
      const gutterCenter = bounds[0] * URBAN_GUTTER_CENTER_FACTOR;
      const gutterDistance = Math.abs(Math.abs(instance.position[0]) - gutterCenter);
      if (gutterDistance < rotated[0] / 2 + URBAN_GUTTER_RESERVED_WIDTH / 2 - 0.005) {
        issues.push(issue(
          "urban_gutter_overlap",
          "error",
          locationId,
          [instance.dressingId],
          `${volume.label} intrudes into the urban drainage channel.`,
        ));
      }
    }

    const blockedDoor = relations
      .filter((relation) => relation.predicate === "against_wall")
      .map((relation) => ({ relation, door: itemsById.get(relation.subjectId) }))
      .find(({ relation, door }) =>
        door &&
        /\b(door|gate|portal|hatch)\b/i.test(door.entity.name) &&
        dressingBlocksAccess(instance, accessPoint(door, relation.metadata?.wall), door),
      );
    if (blockedDoor?.door) {
      issues.push(issue(
        "blocked_access",
        "error",
        locationId,
        [blockedDoor.door.entity.id, instance.dressingId],
        `${volume.label} blocks access to ${blockedDoor.door.entity.name}.`,
      ));
    }

    for (const canonical of canonicalVolumes) {
      if (canonical.floorLayer || volume.floorLayer || instance.supportId === canonical.id) continue;
      if (volumeOverlaps(volume, canonical)) {
        issues.push(issue(
          "dressing_overlap",
          "error",
          locationId,
          [instance.dressingId, canonical.id],
          `${volume.label} overlaps ${canonical.label}.`,
        ));
      }
    }
  }

  for (let leftIndex = 0; leftIndex < dressingInstances.length; leftIndex += 1) {
    const left = dressingInstances[leftIndex]!;
    const leftVolume = dressingVolumes[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < dressingInstances.length; rightIndex += 1) {
      const right = dressingInstances[rightIndex]!;
      const rightVolume = dressingVolumes[rightIndex]!;
      if (
        leftVolume.floorLayer ||
        rightVolume.floorLayer ||
        left.supportId === right.dressingId ||
        right.supportId === left.dressingId
      ) continue;
      const sameAsset = dressingAssetKey(left) === dressingAssetKey(right);
      const distance = Math.hypot(
        left.position[0] - right.position[0],
        left.position[1] - right.position[1],
        left.position[2] - right.position[2],
      );
      if (sameAsset && distance < DUPLICATE_POSITION_EPSILON) {
        issues.push(issue(
          "duplicate_dressing",
          "error",
          locationId,
          [left.dressingId, right.dressingId],
          `${leftVolume.label} and ${rightVolume.label} duplicate the same asset in one position.`,
        ));
        continue;
      }
      if (volumeOverlaps(leftVolume, rightVolume)) {
        issues.push(issue(
          "dressing_overlap",
          "error",
          locationId,
          [left.dressingId, right.dressingId],
          `${leftVolume.label} overlaps ${rightVolume.label}.`,
        ));
      }
    }
  }

  const footprint = layout.items.reduce(
    (total, item) => {
      const dimensions = effectiveDimensions(item);
      return total + dimensions[0] * dimensions[2];
    },
    0,
  ) + dressingInstances.reduce(
    (total, instance) => instance.placementAnchor === "floor"
      ? total + instance.dimensions[0] * instance.dimensions[2]
      : total,
    0,
  );
  const occupancy = footprint / (bounds[0] * bounds[2]);
  if (
    presentation.dressing.density === "rich" &&
    presentation.modules.dressing.length < 2 &&
    occupancy < 0.035
  ) {
    issues.push(issue(
      "underdressed_location",
      "warning",
      locationId,
      [],
      `${layout.location.name} requests rich dressing but has little visual coverage.`,
    ));
  }

  const errorCount = issues.filter((candidate) => candidate.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return {
    locationId,
    status: errorCount > 0 ? "blocking" : warningCount > 0 ? "review" : "clean",
    score: Math.max(0, 100 - errorCount * 35 - warningCount * 12),
    issues,
    entityCount: layout.items.length,
    decorativeModuleCount: presentation.modules.dressing.length,
  };
}

/** Audits the exact deterministic layouts consumed by WorldViewer. */
export function auditSceneComposition(
  snapshot: WorldSnapshot,
  presentations: Readonly<Record<string, ScenePresentation>>,
  registry: AssetRegistry,
  dressingByLocation: Readonly<Record<string, readonly ResolvedDressingInstance[]>> = {},
): SceneCompositionAudit {
  const locations = Object.fromEntries(
    snapshot.locations.map((location) => {
      const presentation = presentations[location.id];
      if (!presentation) {
        const missing: LocationCompositionAudit = {
          locationId: location.id,
          status: "blocking",
          score: 0,
          issues: [issue(
            "underdressed_location",
            "error",
            location.id,
            [],
            `${location.name} has no compiled visual presentation.`,
          )],
          entityCount: 0,
          decorativeModuleCount: 0,
        };
        return [location.id, missing];
      }
      return [
        location.id,
        auditLocation(
          snapshot,
          createWorldLayout(snapshot, registry, [], location.id),
          presentation,
          dressingByLocation[location.id] ?? [],
        ),
      ];
    }),
  );
  const reports = Object.values(locations);
  const errorCount = reports.reduce(
    (total, report) => total + report.issues.filter((candidate) => candidate.severity === "error").length,
    0,
  );
  const warningCount = reports.reduce(
    (total, report) => total + report.issues.filter((candidate) => candidate.severity === "warning").length,
    0,
  );
  return {
    status: errorCount > 0 ? "blocking" : warningCount > 0 ? "review" : "clean",
    score: reports.length === 0
      ? 100
      : Math.round(reports.reduce((total, report) => total + report.score, 0) / reports.length),
    warningCount,
    errorCount,
    locations,
  };
}
