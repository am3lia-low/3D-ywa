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
const WALL_CLEARANCE = 0.018;

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

function overlaps(a: LayoutItem, b: LayoutItem, spacing = SPACING): boolean {
  return (
    Math.abs(a.position[0] - b.position[0]) < (a.dimensions[0] + b.dimensions[0]) / 2 + spacing &&
    Math.abs(a.position[1] - b.position[1]) < (a.dimensions[1] + b.dimensions[1]) / 2 + spacing / 2 &&
    Math.abs(a.position[2] - b.position[2]) < (a.dimensions[2] + b.dimensions[2]) / 2 + spacing
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
  if (/\b(book|notebook|journal|ledger|copybook)\b/.test(semantics)) {
    // Bound volumes need a quieter central writing zone. Using a support edge
    // is technically contained but lets authored covers, pencils and loose
    // pages overhang the visible tabletop.
    localX = -xReach * 0.12;
    localZ = zReach * 0.24;
  } else if (/\b(map|document|paper|parchment|chart|letter)\b/.test(semantics)) {
    localX = xReach * 0.15;
    localZ = zReach * 0.62;
  } else if (/\b(portrait|photograph|photo|picture|frame)\b/.test(semantics)) {
    const isShelfSupport = /\b(shelf|bookshelf|bookcase)\b/.test(targetSemantics);
    // A shelf portrait belongs visibly inside a bay, forward of the backboard
    // and clear of the uprights. Desk frames still use a quiet back corner.
    localX = isShelfSupport ? -xReach * 0.55 : -xReach;
    localZ = isShelfSupport ? zReach : -zReach;
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

function placeOnSupportWithoutCollision(
  draft: Omit<LayoutItem, "position">,
  desired: Vector3Tuple,
  target: LayoutItem,
  bounds: Vector3Tuple,
  placed: readonly LayoutItem[],
): LayoutItem {
  const targetSemantics = [
    target.entity.kind,
    target.entity.name,
    target.asset.key,
    ...(target.entity.aliases ?? []),
  ].join(" ").toLowerCase();
  const irregularSupport = /\b(log|trunk|stump|rock|boulder|barrel)\b/.test(targetSemantics);
  const margin = 0.05;
  const xReach = Math.max(0, (target.dimensions[0] - draft.dimensions[0]) / 2 - margin);
  const zReach = Math.max(0, (target.dimensions[2] - draft.dimensions[2]) / 2 - margin);
  const yaw = target.rotation[1];
  const deltaX = desired[0] - target.position[0];
  const deltaZ = desired[2] - target.position[2];
  const desiredLocalX = deltaX * Math.cos(yaw) - deltaZ * Math.sin(yaw);
  const desiredLocalZ = deltaX * Math.sin(yaw) + deltaZ * Math.cos(yaw);
  const axisSamples = (reach: number) => [-reach, -reach / 2, 0, reach / 2, reach];
  const surfaceGrid: Array<[number, number]> = axisSamples(xReach).flatMap((x) =>
    axisSamples(zReach).map((z): [number, number] => [x, z]),
  );
  const localCandidates: Array<[number, number]> = irregularSupport
    ? [[0, 0]]
    : [[desiredLocalX, desiredLocalZ], ...surfaceGrid];
  localCandidates.sort(
    (left, right) =>
      Math.hypot(left[0] - desiredLocalX, left[1] - desiredLocalZ) -
        Math.hypot(right[0] - desiredLocalX, right[1] - desiredLocalZ) ||
      left[0] - right[0] ||
      left[1] - right[1],
  );

  for (const [localX, localZ] of localCandidates) {
    const position = clampToRoom(
      [
        target.position[0] + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
        desired[1],
        target.position[2] - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
      ],
      draft.dimensions,
      bounds,
    );
    const candidate: LayoutItem = { ...draft, position };
    if (
      !placed.some(
        (other) => other.entity.id !== target.entity.id && overlaps(candidate, other, 0.025),
      )
    ) return candidate;
  }

  // Returning the intended support position keeps the relation truthful; the
  // composition preflight will reject a genuinely overfull surface.
  return { ...draft, position: clampToRoom(desired, draft.dimensions, bounds) };
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
    // Wall-authored assets use local Z as their surface normal. After a
    // quarter-turn on side walls their normal extent is still local depth,
    // never local width. The old east/west rule used width and could leave a
    // door or cabinet more than half a metre in front of the wall.
    const normalHalfExtent = item.dimensions[2] / 2;
    if (wall === "north") return [0, baseY, -bounds[2] / 2 + normalHalfExtent + WALL_CLEARANCE];
    if (wall === "south") return [0, baseY, bounds[2] / 2 - normalHalfExtent - WALL_CLEARANCE];
    if (wall === "east") return [bounds[0] / 2 - normalHalfExtent - WALL_CLEARANCE, baseY, 0];
    return [-bounds[0] / 2 + normalHalfExtent + WALL_CLEARANCE, baseY, 0];
  }

  if (!target) return undefined;
  const xGap = target.dimensions[0] / 2 + item.dimensions[0] / 2 + distance;
  const zGap = target.dimensions[2] / 2 + item.dimensions[2] / 2 + distance;

  const nearWallArchitecture = (): Vector3Tuple | undefined => {
    if (relation.predicate !== "near" || target.entity.kind !== "architecture") return undefined;
    const furnitureClearance = Math.max(distance, 0.68);
    const nearNorth = Math.abs(target.position[2] + bounds[2] / 2) < 1.6;
    const nearSouth = Math.abs(target.position[2] - bounds[2] / 2) < 1.6;
    const nearWest = Math.abs(target.position[0] + bounds[0] / 2) < 1.6;
    const nearEast = Math.abs(target.position[0] - bounds[0] / 2) < 1.6;
    if (nearNorth) {
      return [
        target.position[0] + xGap,
        baseY,
        target.position[2] + target.dimensions[2] / 2 + item.dimensions[2] / 2 + furnitureClearance,
      ];
    }
    if (nearSouth) {
      return [
        target.position[0] - xGap,
        baseY,
        target.position[2] - target.dimensions[2] / 2 - item.dimensions[2] / 2 - furnitureClearance,
      ];
    }
    if (nearWest) {
      return [
        target.position[0] + target.dimensions[2] / 2 + item.dimensions[2] / 2 + furnitureClearance,
        baseY,
        target.position[2] - zGap,
      ];
    }
    if (nearEast) {
      return [
        target.position[0] - target.dimensions[2] / 2 - item.dimensions[2] / 2 - furnitureClearance,
        baseY,
        target.position[2] + zGap,
      ];
    }
    return undefined;
  };

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
      return nearWallArchitecture()
        ?? [target.position[0] + xGap, baseY, target.position[2] + distance / 2];
    case "on":
      {
        const [offsetX, offsetZ] = surfaceOffset(item, target);
        const itemHeight = item.dimensions[1] * item.scale[1];
        const supportRatio = item.entity.state?.supportSurfaceRatio;
        const supportY = typeof supportRatio === "number"
          ? target.position[1] - target.dimensions[1] * target.scale[1] / 2
            + target.dimensions[1] * target.scale[1] * clamp(supportRatio, 0, 1)
          : supportSurfaceWorldY(target);
        return [
          target.position[0] + offsetX,
          supportY + itemHeight / 2 + 0.008,
          target.position[2] + offsetZ,
        ];
      }
    case "inside":
      return [target.position[0], target.position[1], target.position[2]];
    default:
      return undefined;
  }
}

function placeAgainstWallWithoutCollision(
  draft: Omit<LayoutItem, "position">,
  desired: Vector3Tuple,
  wall: "north" | "south" | "east" | "west",
  bounds: Vector3Tuple,
  placed: readonly LayoutItem[],
): LayoutItem {
  const halfTangent = Math.max(0, (wall === "north" || wall === "south" ? bounds[0] : bounds[2]) / 2 - draft.dimensions[0] / 2 - SPACING);
  const distances = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6];
  const step = Math.max(0.55, draft.dimensions[0] + SPACING);

  for (const distance of distances) {
    const tangent = clamp(
      (wall === "north" || wall === "south" ? desired[0] : desired[2]) + distance * step,
      -halfTangent,
      halfTangent,
    );
    const position: Vector3Tuple = wall === "north" || wall === "south"
      ? [tangent, desired[1], desired[2]]
      : [desired[0], desired[1], tangent];
    const candidate: LayoutItem = { ...draft, position };
    if (!placed.some((other) => overlaps(candidate, other, 0.04))) return candidate;
  }

  // Never trade wall flushness for a collision fallback. Composition
  // preflight can flag an overfull wall, while a detached portal is always a
  // visible runtime defect.
  return { ...draft, position: desired };
}

function placeWithoutCollision(
  draft: Omit<LayoutItem, "position">,
  desired: Vector3Tuple,
  bounds: Vector3Tuple,
  placed: LayoutItem[],
  allowedOverlapIds: ReadonlySet<string> = new Set(),
  collisionSpacing = SPACING,
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
        (other) =>
          !allowedOverlapIds.has(other.entity.id) &&
          overlaps(candidate, other, collisionSpacing),
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

function relationPriority(relation: SpatialRelation): number {
  if (relation.predicate === "on" || relation.predicate === "inside") return 0;
  if (relation.predicate === "against_wall") return 1;
  if (relation.predicate === "near") return 3;
  return 2;
}

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
  const evidence = `${draft.entity.provenance?.sentence ?? ""} ${JSON.stringify(draft.entity.state ?? {})}`;
  const explicitlyFacesRoom = /(?:angled|facing|turned)\s+(?:in)?toward(?:s)?\s+the\s+room/i.test(evidence);
  const directionX = explicitlyFacesRoom ? -position[0] : target.position[0] - position[0];
  const directionZ = explicitlyFacesRoom ? -position[2] : target.position[2] - position[2];
  if (Math.abs(directionX) + Math.abs(directionZ) < Number.EPSILON) return draft;

  return {
    ...draft,
    // Normalized furniture assets face +Z. Point that local forward axis at
    // the related object so chairs face desks instead of the room exterior.
    rotation: [draft.rotation[0], Math.atan2(directionX, directionZ), draft.rotation[2]],
  };
}

function orientAgainstWall(
  draft: Omit<LayoutItem, "position">,
  relation?: SpatialRelation,
): Omit<LayoutItem, "position"> {
  if (
    relation?.predicate !== "against_wall" ||
    draft.entity.transform?.rotation
  ) {
    return draft;
  }

  const wall = relation.metadata?.wall ?? "north";
  return {
    ...draft,
    // Normalized architectural assets use their local Z axis as the surface
    // normal. Quarter-turn them for side walls so doors and windows sit flush.
    rotation: [
      draft.rotation[0],
      wall === "east" || wall === "west" ? Math.PI / 2 : 0,
      draft.rotation[2],
    ],
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
    const orientedDraft = orientAgainstWall(draft, wallRelation);
    const item = wallRelation
      ? placeAgainstWallWithoutCollision(orientedDraft, desiredPosition, wall, bounds, placed)
      : placeWithoutCollision(orientedDraft, desiredPosition, bounds, placed);
    placed.push(item);
    placedById.set(item.entity.id, item);
  }
  pending = pending.filter((item) => !item.entity.transform?.position);

  // Place unconstrained anchors before resolving dependants. Previously an
  // unpositioned table was deferred until after the relation passes, so props
  // declared "on" that table also fell back to unrelated default positions.
  const unconstrainedAnchors = pending.filter(
    (item) => (relationsBySubject.get(item.entity.id) ?? []).length === 0,
  );
  for (const draft of unconstrainedAnchors) {
    const desired = defaultPosition(draft.entity, bounds, draft.dimensions[1]);
    const item = placeWithoutCollision(draft, desired, bounds, placed);
    placed.push(item);
    placedById.set(item.entity.id, item);
  }
  const unconstrainedIds = new Set(unconstrainedAnchors.map((item) => item.entity.id));
  pending = pending.filter((item) => !unconstrainedIds.has(item.entity.id));

  // Multiple passes allow relations to entities that were themselves inferred.
  while (pending.length > 0) {
    let progress = false;
    const nextPending: typeof pending = [];
    for (const draft of pending) {
      const relations = relationsBySubject.get(draft.entity.id) ?? [];
      const resolved = [...relations]
        .sort((left, right) => relationPriority(left) - relationPriority(right))
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
      const orientedDraft = orientAgainstWall(orientFurnitureTowardRelation(
        draft,
        resolved.relation,
        resolved.position,
        placedById,
      ), resolved.relation);
      const supportTarget = resolved.relation.objectId
        ? placedById.get(resolved.relation.objectId)
        : undefined;
      const item = resolved.relation.predicate === "against_wall"
        ? placeAgainstWallWithoutCollision(
            orientedDraft,
            resolved.position,
            resolved.relation.metadata?.wall ?? "north",
            bounds,
            placed,
          )
        : resolved.relation.predicate === "on" && supportTarget
        ? placeOnSupportWithoutCollision(
            orientedDraft,
            resolved.position,
            supportTarget,
            bounds,
            placed,
          )
        : placeWithoutCollision(
            orientedDraft,
            resolved.position,
            bounds,
            placed,
            supportedBy,
            resolved.relation.predicate === "inside" ? 0.025 : SPACING,
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
