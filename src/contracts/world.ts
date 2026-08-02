export type Vector3Tuple = [number, number, number];

export type EntityKind =
  | "furniture"
  | "character"
  | "architecture"
  | "light"
  | "decor"
  | "container"
  | "unknown";

export interface Transform {
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
  scale?: Vector3Tuple;
}

export interface Location {
  id: string;
  name: string;
  /** Width, height and depth in world units. */
  bounds?: Vector3Tuple;
  environment?: {
    floorColor?: string;
    wallColor?: string;
    ambientColor?: string;
  };
}

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind | (string & {});
  locationId: string;
  assetKey?: string;
  aliases?: string[];
  transform?: Transform;
  /** Optional physical width, height and depth override. */
  dimensions?: Vector3Tuple;
  state?: Record<string, unknown>;
  provenance?: {
    passageId: string;
    sentence?: string;
    confidence?: number;
  };
}

export type SpatialPredicate =
  | "left_of"
  | "right_of"
  | "in_front_of"
  | "behind"
  | "near"
  | "on"
  | "inside"
  | "against_wall"
  | "centered";

export interface SpatialRelation {
  id: string;
  subjectId: string;
  predicate: SpatialPredicate | (string & {});
  objectId?: string;
  distance?: number;
  metadata?: {
    wall?: "north" | "south" | "east" | "west";
  };
}

export interface Conflict {
  id: string;
  entityId?: string;
  description: string;
  status: "open" | "resolved" | "ignored";
  passageIds?: string[];
}

/** Frozen cross-team contract from the proposal. */
export interface WorldSnapshot {
  storyId: string;
  version: number;
  passageId: string;
  locations: Location[];
  entities: Entity[];
  relations: SpatialRelation[];
  conflicts: Conflict[];
}

export type PatchOperation =
  | { op: "add_entity"; entity: Entity }
  | { op: "remove_entity"; entityId: string }
  | {
      op: "move_entity";
      entityId: string;
      position: Vector3Tuple;
      rotation?: Vector3Tuple;
      locationId?: string;
    }
  | {
      op: "update_entity";
      entityId: string;
      changes: Partial<
        Pick<Entity, "name" | "kind" | "assetKey" | "dimensions" | "state" | "transform">
      >;
    }
  | { op: "add_relation"; relation: SpatialRelation }
  | { op: "remove_relation"; relationId: string };

/** Frozen cross-team contract from the proposal. */
export interface ScenePatch {
  fromVersion: number;
  toVersion: number;
  operations: PatchOperation[];
}

