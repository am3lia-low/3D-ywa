import type { SpatialRelation, Vector3Tuple, WorldSnapshot } from "../contracts/world";
import type { AssetRegistry } from "./assetRegistry";
import { createWorldLayout, type LayoutItem, type WorldLayout } from "./layoutEngine";
import type { ScenePresentation } from "./sceneCompiler";

export type CompositionIssueCode =
  | "entity_overlap"
  | "blocked_access"
  | "floating_entity"
  | "facing_mismatch"
  | "broken_surface_relation"
  | "implausible_scale"
  | "underdressed_location";

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

function effectiveDimensions(item: LayoutItem): Vector3Tuple {
  return item.dimensions.map(
    (value, axis) => value * item.scale[axis]!,
  ) as Vector3Tuple;
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

function isFloorLayer(item: LayoutItem): boolean {
  return item.entity.kind === "decor" && effectiveDimensions(item)[1] <= 0.16;
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

function auditLocation(
  snapshot: WorldSnapshot,
  layout: WorldLayout,
  presentation: ScenePresentation,
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
    if (
      scaledDimensions[0] > bounds[0] * 0.82 ||
      scaledDimensions[1] > bounds[1] * 0.95 ||
      scaledDimensions[2] > bounds[2] * 0.82
    ) {
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
    if (!isSupported && left.entity.kind !== "architecture" && bottom > FLOOR_EPSILON) {
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
      if (alignment < 0.55) {
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
        (candidate) => candidate.entity.id !== subject.entity.id && blocksAccess(candidate, point, subject),
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

  const footprint = layout.items.reduce(
    (total, item) => {
      const dimensions = effectiveDimensions(item);
      return total + dimensions[0] * dimensions[2];
    },
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
