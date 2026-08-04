import type {
  Entity,
  Location,
  SpatialRelation,
  Vector3Tuple,
  WorldSnapshot,
} from "../contracts/world";
import {
  defaultAssetRegistry,
  resolveAsset,
  type AssetDefinition,
  type AssetRegistry,
} from "./assetRegistry";

export interface LayoutItem {
  entity: Entity;
  asset: AssetDefinition;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
  dimensions: Vector3Tuple;
}

export interface WorldLayout {
  location: Location;
  items: LayoutItem[];
}

const DEFAULT_BOUNDS: Vector3Tuple = [12, 4.5, 10];
const SPACING = 0.18;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampToRoom(
  position: Vector3Tuple,
  dimensions: Vector3Tuple,
  bounds: Vector3Tuple,
): Vector3Tuple {
  const halfWidth = Math.max(0, bounds[0] / 2 - dimensions[0] / 2 - SPACING);
  const halfDepth = Math.max(0, bounds[2] / 2 - dimensions[2] / 2 - SPACING);
  return [
    clamp(position[0], -halfWidth, halfWidth),
    clamp(position[1], dimensions[1] / 2, bounds[1] - dimensions[1] / 2),
    clamp(position[2], -halfDepth, halfDepth),
  ];
}

function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  return (
    Math.abs(a.position[0] - b.position[0]) < (a.dimensions[0] + b.dimensions[0]) / 2 + SPACING &&
    Math.abs(a.position[1] - b.position[1]) < (a.dimensions[1] + b.dimensions[1]) / 2 + SPACING / 2 &&
    Math.abs(a.position[2] - b.position[2]) < (a.dimensions[2] + b.dimensions[2]) / 2 + SPACING
  );
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function candidateOffsets(entity: Entity, step: number): Array<[number, number]> {
  const phase = (stableHash(entity.id) % 4) * (Math.PI / 2);
  const offsets: Array<[number, number]> = [[0, 0]];

  for (let ring = 1; ring <= 8; ring += 1) {
    const samples = ring * 8;
    for (let sample = 0; sample < samples; sample += 1) {
      const angle = phase + (sample / samples) * Math.PI * 2;
      offsets.push([
        Math.cos(angle) * ring * step,
        Math.sin(angle) * ring * step,
      ]);
    }
  }
  return offsets;
}

function surfaceOffset(
  item: Omit<LayoutItem, "position">,
  target: LayoutItem,
): [number, number] {
  const margin = 0.05;
  const xReach = Math.max(
    0,
    (target.dimensions[0] - item.dimensions[0]) / 2 - margin,
  );
  const zReach = Math.max(
    0,
    (target.dimensions[2] - item.dimensions[2]) / 2 - margin,
  );
  const semantics = [
    item.entity.kind,
    item.entity.name,
    item.asset.key,
    ...(item.entity.aliases ?? []),
  ].join(" ").toLowerCase();
  const targetSemantics = [
    target.entity.kind,
    target.entity.name,
    target.asset.key,
    ...(target.entity.aliases ?? []),
  ].join(" ").toLowerCase();

  // Curved and irregular supports do not have a reliable rectangular top.
  // Their visual safe zone is the center; placing a prop at a bounding-box
  // corner can be mathematically contained while visibly missing the mesh.
  if (/\b(log|trunk|stump|rock|boulder|barrel)\b/.test(targetSemantics)) {
    return [0, 0];
  }

  let localX: number;
  let localZ: number;
  if (/\b(map|document|paper|parchment|chart|letter|book)\b/.test(semantics)) {
    localX = xReach * 0.15;
    localZ = zReach;
  } else if (/\b(light|lantern|lamp|candle)\b/.test(semantics)) {
    localX = xReach;
    localZ = -zReach * 0.5;
  } else if (/\b(container|parcel|crate|chest|box)\b/.test(semantics)) {
    localX = -xReach;
    localZ = -zReach * 0.08;
  } else {
    const slots: Array<[number, number]> = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ];
    const slot = slots[stableHash(item.entity.id) % slots.length]!;
    localX = slot[0] * xReach;
    localZ = slot[1] * zReach;
  }

  const yaw = target.rotation[1];
  return [
    localX * Math.cos(yaw) + localZ * Math.sin(yaw),
    -localX * Math.sin(yaw) + localZ * Math.cos(yaw),
  ];
}

function relationPosition(
  relation: SpatialRelation,
  item: Omit<LayoutItem, "position">,
  placedById: ReadonlyMap<string, LayoutItem>,
  bounds: Vector3Tuple,
): Vector3Tuple | undefined {
  const target = relation.objectId ? placedById.get(relation.objectId) : undefined;
  const distance = relation.distance ?? 0.8;
  const baseY = item.dimensions[1] / 2;

  if (relation.predicate === "centered") return [0, baseY, 0];

  if (relation.predicate === "against_wall") {
    const wall = relation.metadata?.wall ?? "north";
    if (wall === "north") return [0, baseY, -bounds[2] / 2 + item.dimensions[2] / 2 + SPACING];
    if (wall === "south") return [0, baseY, bounds[2] / 2 - item.dimensions[2] / 2 - SPACING];
    if (wall === "east") return [bounds[0] / 2 - item.dimensions[0] / 2 - SPACING, baseY, 0];
    return [-bounds[0] / 2 + item.dimensions[0] / 2 + SPACING, baseY, 0];
  }

  if (!target) return undefined;
  const xGap = target.dimensions[0] / 2 + item.dimensions[0] / 2 + distance;
  const zGap = target.dimensions[2] / 2 + item.dimensions[2] / 2 + distance;

  switch (relation.predicate) {
    case "left_of":
      return [target.position[0] - xGap, baseY, target.position[2]];
    case "right_of":
      return [target.position[0] + xGap, baseY, target.position[2]];
    case "in_front_of":
      return [target.position[0], baseY, target.position[2] + zGap];
    case "behind":
      return [target.position[0], baseY, target.position[2] - zGap];
    case "near":
      return [target.position[0] + xGap, baseY, target.position[2] + distance / 2];
    case "on":
      {
        const [offsetX, offsetZ] = surfaceOffset(item, target);
        const itemHeight = item.dimensions[1] * item.scale[1];
        return [
          target.position[0] + offsetX,
          supportSurfaceWorldY(target) + itemHeight / 2 + 0.008,
          target.position[2] + offsetZ,
        ];
      }
    case "inside":
      return [target.position[0], target.position[1], target.position[2]];
    default:
      return undefined;
  }
}

function placeWithoutCollision(
  draft: Omit<LayoutItem, "position">,
  desired: Vector3Tuple,
  bounds: Vector3Tuple,
  placed: LayoutItem[],
  allowedOverlapIds: ReadonlySet<string> = new Set(),
): LayoutItem {
  const step = Math.max(draft.dimensions[0], draft.dimensions[2], 0.75) + SPACING;
  for (const [offsetX, offsetZ] of candidateOffsets(draft.entity, step)) {
    const position = clampToRoom(
      [desired[0] + offsetX, desired[1], desired[2] + offsetZ],
      draft.dimensions,
      bounds,
    );
    const candidate: LayoutItem = { ...draft, position };
    if (
      !placed.some(
        (other) => !allowedOverlapIds.has(other.entity.id) && overlaps(candidate, other),
      )
    ) return candidate;
  }
  return { ...draft, position: clampToRoom(desired, draft.dimensions, bounds) };
}

function defaultPosition(entity: Entity, bounds: Vector3Tuple, height: number): Vector3Tuple {
  const hash = stableHash(entity.id);
  const xRatio = ((hash & 0xffff) / 0xffff) * 2 - 1;
  const zRatio = (((hash >>> 16) & 0xffff) / 0xffff) * 2 - 1;
  return [xRatio * bounds[0] * 0.32, height / 2, zRatio * bounds[2] * 0.32];
}

/** Returns the real visual support height, not merely the asset bounding-box top. */
export function supportSurfaceWorldY(item: LayoutItem): number {
  const height = item.dimensions[1] * item.scale[1];
  return (
    item.position[1] - height / 2 +
    height * (item.asset.supportSurfaceY ?? 1)
  );
}

const FACING_RELATIONS = new Set(["left_of", "right_of", "in_front_of", "behind", "near"]);

function orientFurnitureTowardRelation(
  draft: Omit<LayoutItem, "position">,
  relation: SpatialRelation,
  position: Vector3Tuple,
  placedById: ReadonlyMap<string, LayoutItem>,
): Omit<LayoutItem, "position"> {
  if (
    draft.entity.kind !== "furniture" ||
    draft.entity.transform?.rotation ||
    !relation.objectId ||
    !FACING_RELATIONS.has(relation.predicate)
  ) {
    return draft;
  }

  const target = placedById.get(relation.objectId);
  if (!target) return draft;
  const directionX = target.position[0] - position[0];
  const directionZ = target.position[2] - position[2];
  if (Math.abs(directionX) + Math.abs(directionZ) < Number.EPSILON) return draft;

  return {
    ...draft,
    // Normalized furniture assets face +Z. Point that local forward axis at
    // the related object so chairs face desks instead of the room exterior.
    rotation: [draft.rotation[0], Math.atan2(directionX, directionZ), draft.rotation[2]],
  };
}

/** Deterministically resolves explicit transforms, semantic relations and spacing. */
export function createWorldLayout(
  snapshot: WorldSnapshot,
  registry: AssetRegistry = defaultAssetRegistry,
  pinnedItems: readonly LayoutItem[] = [],
  locationId?: string,
): WorldLayout {
  const location = snapshot.locations.find((candidate) => candidate.id === locationId) ??
    snapshot.locations[0] ?? {
    id: "default-room",
    name: "Untitled room",
    bounds: DEFAULT_BOUNDS,
  };
  const bounds = location.bounds ?? DEFAULT_BOUNDS;
  const validEntityIds = new Set(
    snapshot.entities
      .filter((entity) => entity.locationId === location.id)
      .map((entity) => entity.id),
  );
  const validPinnedItems = pinnedItems.filter((item) => validEntityIds.has(item.entity.id));
  const pinnedIds = new Set(validPinnedItems.map((item) => item.entity.id));
  const entities = snapshot.entities
    .filter((entity) => entity.locationId === location.id && !pinnedIds.has(entity.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const relationsBySubject = new Map<string, SpatialRelation[]>();
  for (const relation of snapshot.relations) {
    const existing = relationsBySubject.get(relation.subjectId) ?? [];
    existing.push(relation);
    relationsBySubject.set(relation.subjectId, existing);
  }

  // Pinned items are accepted as already-resolved world coordinates. They are
  // inserted before new work so later entities route around the existing room.
  const placed = [...validPinnedItems];
  const placedById = new Map(placed.map((item) => [item.entity.id, item]));
  let pending = entities.map((entity) => {
    const asset = resolveAsset(entity, registry);
    return {
      entity,
      asset,
      dimensions: asset.dimensions,
      rotation: entity.transform?.rotation ?? ([0, 0, 0] as Vector3Tuple),
      scale: entity.transform?.scale ?? ([1, 1, 1] as Vector3Tuple),
    };
  });

  // Explicit coordinates are authoritative and placed first.
  for (const draft of pending.filter((item) => item.entity.transform?.position)) {
    const explicitPosition = draft.entity.transform?.position ?? [0, draft.dimensions[1] / 2, 0];
    const wallRelation = (relationsBySubject.get(draft.entity.id) ?? []).find(
      (relation) => relation.predicate === "against_wall",
    );
    const wallPosition = wallRelation
      ? relationPosition(wallRelation, draft, placedById, bounds)
      : undefined;
    const wall = wallRelation?.metadata?.wall ?? "north";
    const desiredPosition: Vector3Tuple = wallPosition
      ? wall === "north" || wall === "south"
        ? [explicitPosition[0], wallPosition[1], wallPosition[2]]
        : [wallPosition[0], wallPosition[1], explicitPosition[2]]
      : explicitPosition;
    const item = placeWithoutCollision(
      draft,
      desiredPosition,
      bounds,
      placed,
    );
    placed.push(item);
    placedById.set(item.entity.id, item);
  }
  pending = pending.filter((item) => !item.entity.transform?.position);

  // Multiple passes allow relations to entities that were themselves inferred.
  while (pending.length > 0) {
    let progress = false;
    const nextPending: typeof pending = [];
    for (const draft of pending) {
      const relations = relationsBySubject.get(draft.entity.id) ?? [];
      const resolved = relations
        .map((relation) => ({
          relation,
          position: relationPosition(relation, draft, placedById, bounds),
        }))
        .find(
          (candidate): candidate is { relation: SpatialRelation; position: Vector3Tuple } =>
            candidate.position !== undefined,
        );
      if (!resolved) {
        nextPending.push(draft);
        continue;
      }
      const supportedBy =
        (resolved.relation.predicate === "on" || resolved.relation.predicate === "inside") &&
        resolved.relation.objectId
          ? new Set([resolved.relation.objectId])
          : new Set<string>();
      const orientedDraft = orientFurnitureTowardRelation(
        draft,
        resolved.relation,
        resolved.position,
        placedById,
      );
      const item = placeWithoutCollision(
        orientedDraft,
        resolved.position,
        bounds,
        placed,
        supportedBy,
      );
      placed.push(item);
      placedById.set(item.entity.id, item);
      progress = true;
    }
    pending = nextPending;
    if (!progress) break;
  }

  for (const draft of pending) {
    const desired = defaultPosition(draft.entity, bounds, draft.dimensions[1]);
    const item = placeWithoutCollision(draft, desired, bounds, placed);
    placed.push(item);
    placedById.set(item.entity.id, item);
  }

  return { location, items: placed };
}
