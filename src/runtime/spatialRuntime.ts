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

export function createSpatialRuntime(
  snapshot: WorldSnapshot,
  registry: AssetRegistry = defaultAssetRegistry,
): SpatialRuntimeState {
  return {
    snapshot,
    layout: createWorldLayout(snapshot, registry),
    exitingItems: [],
  };
}

function entityIdsRequiringPlacement(patch: ScenePatch): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const operation of patch.operations) {
    if (operation.op === "add_entity" || operation.op === "move_entity") {
      ids.add(operation.op === "add_entity" ? operation.entity.id : operation.entityId);
    }
    if (operation.op === "update_entity" && operation.changes.transform?.position) {
      ids.add(operation.entityId);
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
  const requiresPlacement = entityIdsRequiringPlacement(patch);
  const removedIds = removedEntityIds(patch);

  const pinnedItems = previous.layout.items.flatMap((item) => {
    const entity = nextEntities.get(item.entity.id);
    if (!entity || requiresPlacement.has(entity.id)) return [];
    return [refreshPinnedItem(item, entity, registry)];
  });

  const layout = createWorldLayout(snapshot, registry, pinnedItems);
  const newlyExiting = previous.layout.items.filter(
    (item) => removedIds.has(item.entity.id) && !nextEntities.has(item.entity.id),
  );
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
