import type { Entity, ScenePatch, WorldSnapshot } from "../contracts/world";

export class PatchVersionError extends Error {
  constructor(expected: number, actual: number) {
    super(`Cannot apply patch from version ${actual} to snapshot version ${expected}.`);
    this.name = "PatchVersionError";
  }
}

function replaceEntity(
  entities: Entity[],
  entityId: string,
  update: (entity: Entity) => Entity,
): Entity[] {
  let found = false;
  const next = entities.map((entity) => {
    if (entity.id !== entityId) return entity;
    found = true;
    return update(entity);
  });

  if (!found) throw new Error(`Patch references unknown entity '${entityId}'.`);
  return next;
}

/**
 * Applies semantic operations while retaining object references for untouched
 * entities. React can therefore keep their scene nodes mounted by stable ID.
 */
export function applyScenePatch(snapshot: WorldSnapshot, patch: ScenePatch): WorldSnapshot {
  if (snapshot.version !== patch.fromVersion) {
    throw new PatchVersionError(snapshot.version, patch.fromVersion);
  }

  let entities = snapshot.entities;
  let relations = snapshot.relations;

  for (const operation of patch.operations) {
    switch (operation.op) {
      case "add_entity": {
        if (entities.some((entity) => entity.id === operation.entity.id)) {
          throw new Error(`Entity '${operation.entity.id}' already exists.`);
        }
        entities = [...entities, operation.entity];
        break;
      }
      case "remove_entity": {
        if (!entities.some((entity) => entity.id === operation.entityId)) {
          throw new Error(`Patch references unknown entity '${operation.entityId}'.`);
        }
        entities = entities.filter((entity) => entity.id !== operation.entityId);
        relations = relations.filter(
          (relation) =>
            relation.subjectId !== operation.entityId && relation.objectId !== operation.entityId,
        );
        break;
      }
      case "move_entity": {
        entities = replaceEntity(entities, operation.entityId, (entity) => ({
          ...entity,
          locationId: operation.locationId ?? entity.locationId,
          transform: {
            ...entity.transform,
            position: operation.position,
            rotation: operation.rotation ?? entity.transform?.rotation,
          },
        }));
        break;
      }
      case "update_entity": {
        // A serialized patch spells out every field, so unchanged ones arrive
        // as null. Spreading those over the entity would erase its name and
        // kind, so only fields carrying a value participate in the merge.
        const changes = Object.fromEntries(
          Object.entries(operation.changes).filter(([, value]) => value !== null && value !== undefined),
        ) as typeof operation.changes;
        entities = replaceEntity(entities, operation.entityId, (entity) => ({
          ...entity,
          ...changes,
          transform: changes.transform
            ? { ...entity.transform, ...changes.transform }
            : entity.transform,
          state: changes.state ? { ...entity.state, ...changes.state } : entity.state,
        }));
        break;
      }
      case "add_relation": {
        relations = [
          ...relations.filter((relation) => relation.id !== operation.relation.id),
          operation.relation,
        ];
        break;
      }
      case "remove_relation": {
        relations = relations.filter((relation) => relation.id !== operation.relationId);
        break;
      }
    }
  }

  return {
    ...snapshot,
    version: patch.toVersion,
    entities,
    relations,
  };
}

