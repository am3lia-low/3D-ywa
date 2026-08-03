import type { Entity, ScenePatch, WorldSnapshot } from "../contracts/world";
import {
  defaultAssetRegistry,
  resolveAsset,
  type AssetDefinition,
  type AssetRegistry,
} from "./assetRegistry";
import { applyScenePatch } from "./applyScenePatch";
import { createWorldLayout, type LayoutItem, type WorldLayout } from "./layoutEngine";

export interface SpatialRuntimeState {
  snapshot: WorldSnapshot;
  layout: WorldLayout;
  /** Removed nodes retained temporarily so the renderer can animate them out. */
  exitingItems: readonly LayoutItem[];
}

export class SpatialLocationError extends Error {
  constructor(locationId: string) {
    super(`Location '${locationId}' does not exist in the current world snapshot.`);
    this.name = "SpatialLocationError";
  }
}

function requireLocation(snapshot: WorldSnapshot, locationId?: string): string | undefined {
  if (!locationId) return snapshot.locations[0]?.id;
  if (!snapshot.locations.some((location) => location.id === locationId)) {
    throw new SpatialLocationError(locationId);
  }
  return locationId;
}

export function createSpatialRuntime(
  snapshot: WorldSnapshot,
  registry: AssetRegistry = defaultAssetRegistry,
  locationId?: string,
): SpatialRuntimeState {
  const resolvedLocationId = requireLocation(snapshot, locationId);
  return {
    snapshot,
    layout: createWorldLayout(snapshot, registry, [], resolvedLocationId),
    exitingItems: [],
  };
}

/** Switches the mounted room without replacing or rolling back world state. */
export function switchSpatialRuntimeLocation(
  state: SpatialRuntimeState,
  locationId: string,
  registry: AssetRegistry = defaultAssetRegistry,
): SpatialRuntimeState {
  requireLocation(state.snapshot, locationId);
  if (state.layout.location.id === locationId) return state;
  return {
    ...state,
    layout: createWorldLayout(state.snapshot, registry, [], locationId),
    exitingItems: [],
  };
}

function entityIdsRequiringPlacement(
  previousSnapshot: WorldSnapshot,
  nextSnapshot: WorldSnapshot,
  patch: ScenePatch,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const operation of patch.operations) {
    if (operation.op === "add_entity" || operation.op === "move_entity") {
      ids.add(operation.op === "add_entity" ? operation.entity.id : operation.entityId);
    }
    if (operation.op === "update_entity" && operation.changes.transform?.position) {
      ids.add(operation.entityId);
    }
    if (operation.op === "update_entity" && operation.changes.dimensions) {
      ids.add(operation.entityId);
    }
    if (operation.op === "add_relation") ids.add(operation.relation.subjectId);
    if (operation.op === "remove_relation") {
      const relation = previousSnapshot.relations.find(
        (candidate) => candidate.id === operation.relationId,
      );
      if (relation) ids.add(relation.subjectId);
    }
  }

  // Relations such as "map on desk" are mounted transforms, not decoration.
  // Reflow their subjects transitively whenever the object they depend on moves.
  let changed = true;
  while (changed) {
    changed = false;
    for (const relation of nextSnapshot.relations) {
      if (relation.objectId && ids.has(relation.objectId) && !ids.has(relation.subjectId)) {
        ids.add(relation.subjectId);
        changed = true;
      }
    }
  }
  return ids;
}

function removedEntityIds(patch: ScenePatch): ReadonlySet<string> {
  return new Set(
    patch.operations.flatMap((operation) =>
      operation.op === "remove_entity" ? [operation.entityId] : [],
    ),
  );
}

function sameAssetDefinition(left: AssetDefinition, right: AssetDefinition): boolean {
  return (
    left.key === right.key &&
    left.geometry === right.geometry &&
    left.modelUrl === right.modelUrl &&
    left.color === right.color &&
    left.roughness === right.roughness &&
    left.metalness === right.metalness &&
    left.dimensions.every((value, index) => value === right.dimensions[index])
  );
}

function refreshPinnedItem(previous: LayoutItem, entity: Entity, registry: AssetRegistry): LayoutItem {
  const asset = resolveAsset(entity, registry);
  if (entity === previous.entity && sameAssetDefinition(asset, previous.asset)) return previous;

  return {
    ...previous,
    entity,
    asset,
    dimensions: asset.dimensions,
    rotation: entity.transform?.rotation ?? previous.rotation,
    scale: entity.transform?.scale ?? previous.scale,
  };
}

/** Refreshes resolved visual assets without replacing factual world state or coordinates. */
export function refreshSpatialRuntimeAssets(
  state: SpatialRuntimeState,
  registry: AssetRegistry = defaultAssetRegistry,
): SpatialRuntimeState {
  const refresh = (item: LayoutItem) => refreshPinnedItem(item, item.entity, registry);
  const items = state.layout.items.map(refresh);
  const exitingItems = state.exitingItems.map(refresh);
  const unchanged =
    items.every((item, index) => item === state.layout.items[index]) &&
    exitingItems.every((item, index) => item === state.exitingItems[index]);

  return unchanged
    ? state
    : {
        ...state,
        layout: { ...state.layout, items },
        exitingItems,
      };
}

/**
 * Advances the mounted spatial world without recalculating unaffected items.
 * Existing resolved coordinates are pinned before new or moved entities are
 * placed, making continuity independent of entity ordering and new collisions.
 */
export function advanceSpatialRuntime(
  previous: SpatialRuntimeState,
  patch: ScenePatch,
  registry: AssetRegistry = defaultAssetRegistry,
): SpatialRuntimeState {
  const snapshot = applyScenePatch(previous.snapshot, patch);
  const nextEntities = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  const requiresPlacement = entityIdsRequiringPlacement(previous.snapshot, snapshot, patch);
  const removedIds = removedEntityIds(patch);

  const pinnedItems = previous.layout.items.flatMap((item) => {
    const entity = nextEntities.get(item.entity.id);
    if (!entity || requiresPlacement.has(entity.id)) return [];
    return [refreshPinnedItem(item, entity, registry)];
  });

  const activeLocationId = previous.layout.location.id;
  const layout = createWorldLayout(snapshot, registry, pinnedItems, activeLocationId);
  const nextVisibleIds = new Set(layout.items.map((item) => item.entity.id));
  const newlyExiting = previous.layout.items.filter((item) => {
    const nextEntity = nextEntities.get(item.entity.id);
    return (
      !nextVisibleIds.has(item.entity.id) &&
      (removedIds.has(item.entity.id) || nextEntity?.locationId !== activeLocationId)
    );
  });
  const exitingById = new Map(
    [...previous.exitingItems, ...newlyExiting].map((item) => [item.entity.id, item]),
  );

  return {
    snapshot,
    layout,
    exitingItems: [...exitingById.values()],
  };
}

export function clearSpatialRuntimeExits(state: SpatialRuntimeState): SpatialRuntimeState {
  return state.exitingItems.length === 0 ? state : { ...state, exitingItems: [] };
}
