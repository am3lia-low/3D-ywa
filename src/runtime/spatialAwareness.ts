import type {
  Conflict,
  Entity,
  SpatialRelation,
  Vector3Tuple,
  WorldSnapshot,
} from "../contracts/world";
import type { WorldLayout } from "./layoutEngine";

export interface EntityRelationContext {
  relation: SpatialRelation;
  sentence: string;
  relatedEntity?: Entity;
}

export interface EntitySpatialContext {
  entity: Entity;
  relations: EntityRelationContext[];
  conflicts: Conflict[];
}

export interface VisibleRelationEdge {
  relation: SpatialRelation;
  sentence: string;
  from: Vector3Tuple;
  to: Vector3Tuple;
  midpoint: Vector3Tuple;
}

export function spatialPredicateLabel(predicate: string): string {
  return predicate.replaceAll("_", " ");
}

function relationSentence(
  relation: SpatialRelation,
  entitiesById: ReadonlyMap<string, Entity>,
): string {
  const subject = entitiesById.get(relation.subjectId)?.name ?? relation.subjectId;
  const object = relation.objectId
    ? (entitiesById.get(relation.objectId)?.name ?? relation.objectId)
    : relation.predicate === "against_wall"
      ? `${relation.metadata?.wall ?? "north"} wall`
      : "the room";
  return `${subject} ${spatialPredicateLabel(relation.predicate)} ${object}`;
}

export function getEntitySpatialContext(
  snapshot: WorldSnapshot,
  entityId: string | null | undefined,
): EntitySpatialContext | null {
  if (!entityId) return null;
  const entitiesById = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  const entity = entitiesById.get(entityId);
  if (!entity) return null;

  const relations = snapshot.relations.flatMap((relation): EntityRelationContext[] => {
    if (relation.subjectId !== entityId && relation.objectId !== entityId) return [];
    const relatedEntityId =
      relation.subjectId === entityId ? relation.objectId : relation.subjectId;
    return [
      {
        relation,
        sentence: relationSentence(relation, entitiesById),
        relatedEntity: relatedEntityId ? entitiesById.get(relatedEntityId) : undefined,
      },
    ];
  });

  return {
    entity,
    relations,
    conflicts: snapshot.conflicts.filter(
      (conflict) =>
        conflict.status === "open" && (!conflict.entityId || conflict.entityId === entityId),
    ),
  };
}

function relationAnchor(
  position: Vector3Tuple,
  dimensions: Vector3Tuple,
): Vector3Tuple {
  return [position[0], position[1] + dimensions[1] * 0.62, position[2]];
}

export function createVisibleRelationEdges(
  layout: WorldLayout,
  relations: readonly SpatialRelation[],
  selectedEntityId: string | null | undefined,
): VisibleRelationEdge[] {
  if (!selectedEntityId) return [];
  const itemsById = new Map(layout.items.map((item) => [item.entity.id, item]));
  const entitiesById = new Map(layout.items.map((item) => [item.entity.id, item.entity]));

  return relations.flatMap((relation): VisibleRelationEdge[] => {
    if (
      !relation.objectId ||
      (relation.subjectId !== selectedEntityId && relation.objectId !== selectedEntityId)
    ) {
      return [];
    }
    const subject = itemsById.get(relation.subjectId);
    const object = itemsById.get(relation.objectId);
    if (!subject || !object) return [];
    const from = relationAnchor(subject.position, subject.dimensions);
    const to = relationAnchor(object.position, object.dimensions);
    return [
      {
        relation,
        sentence: relationSentence(relation, entitiesById),
        from,
        to,
        midpoint: [
          (from[0] + to[0]) / 2,
          (from[1] + to[1]) / 2 + 0.18,
          (from[2] + to[2]) / 2,
        ],
      },
    ];
  });
}
