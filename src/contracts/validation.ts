import { z } from "zod";
import type { ScenePatch, WorldSnapshot } from "./world";

const identifierSchema = z.string().trim().min(1);
const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
const positiveVector3Schema = z.tuple([
  z.number().positive(),
  z.number().positive(),
  z.number().positive(),
]);
const jsonRecordSchema = z.record(z.string(), z.unknown());

export const TransformSchema = z.looseObject({
  position: vector3Schema.optional(),
  rotation: vector3Schema.optional(),
  scale: vector3Schema.optional(),
});

export const LocationSchema = z.looseObject({
  id: identifierSchema,
  name: z.string().trim().min(1),
  bounds: positiveVector3Schema.optional(),
  environment: z
    .looseObject({
      floorColor: z.string().optional(),
      wallColor: z.string().optional(),
      ambientColor: z.string().optional(),
    })
    .optional(),
});

export const EntitySchema = z.looseObject({
  id: identifierSchema,
  name: z.string().trim().min(1),
  kind: identifierSchema,
  locationId: identifierSchema,
  assetKey: identifierSchema.optional(),
  aliases: z.array(z.string().trim().min(1)).optional(),
  transform: TransformSchema.optional(),
  dimensions: positiveVector3Schema.optional(),
  state: jsonRecordSchema.optional(),
  provenance: z
    .looseObject({
      passageId: identifierSchema,
      sentence: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export const SpatialRelationSchema = z.looseObject({
  id: identifierSchema,
  subjectId: identifierSchema,
  predicate: identifierSchema,
  objectId: identifierSchema.optional(),
  distance: z.number().nonnegative().optional(),
  metadata: z
    .looseObject({
      wall: z.enum(["north", "south", "east", "west"]).optional(),
    })
    .optional(),
});

export const ConflictSchema = z.looseObject({
  id: identifierSchema,
  entityId: identifierSchema.optional(),
  description: z.string().trim().min(1),
  status: z.enum(["open", "resolved", "ignored"]),
  passageIds: z.array(identifierSchema).optional(),
});

export const WorldSnapshotSchema = z
  .strictObject({
    storyId: identifierSchema,
    version: z.number().int().nonnegative(),
    passageId: identifierSchema,
    locations: z.array(LocationSchema).min(1),
    entities: z.array(EntitySchema),
    relations: z.array(SpatialRelationSchema),
    conflicts: z.array(ConflictSchema),
  })
  .superRefine((snapshot, context) => {
    const locationIds = new Set<string>();
    for (const [index, location] of snapshot.locations.entries()) {
      if (locationIds.has(location.id)) {
        context.addIssue({
          code: "custom",
          path: ["locations", index, "id"],
          message: `Duplicate location ID '${location.id}'.`,
        });
      }
      locationIds.add(location.id);
    }

    const entityIds = new Set<string>();
    for (const [index, entity] of snapshot.entities.entries()) {
      if (entityIds.has(entity.id)) {
        context.addIssue({
          code: "custom",
          path: ["entities", index, "id"],
          message: `Duplicate entity ID '${entity.id}'.`,
        });
      }
      entityIds.add(entity.id);
      if (!locationIds.has(entity.locationId)) {
        context.addIssue({
          code: "custom",
          path: ["entities", index, "locationId"],
          message: `Unknown location '${entity.locationId}'.`,
        });
      }
    }

    const relationIds = new Set<string>();
    for (const [index, relation] of snapshot.relations.entries()) {
      if (relationIds.has(relation.id)) {
        context.addIssue({
          code: "custom",
          path: ["relations", index, "id"],
          message: `Duplicate relation ID '${relation.id}'.`,
        });
      }
      relationIds.add(relation.id);
      if (!entityIds.has(relation.subjectId)) {
        context.addIssue({
          code: "custom",
          path: ["relations", index, "subjectId"],
          message: `Unknown subject entity '${relation.subjectId}'.`,
        });
      }
      if (relation.objectId && !entityIds.has(relation.objectId)) {
        context.addIssue({
          code: "custom",
          path: ["relations", index, "objectId"],
          message: `Unknown object entity '${relation.objectId}'.`,
        });
      }
      if (
        !relation.objectId &&
        relation.predicate !== "centered" &&
        relation.predicate !== "against_wall"
      ) {
        context.addIssue({
          code: "custom",
          path: ["relations", index, "objectId"],
          message: `Relation '${relation.predicate}' requires an objectId.`,
        });
      }
    }

    const conflictIds = new Set<string>();
    for (const [index, conflict] of snapshot.conflicts.entries()) {
      if (conflictIds.has(conflict.id)) {
        context.addIssue({
          code: "custom",
          path: ["conflicts", index, "id"],
          message: `Duplicate conflict ID '${conflict.id}'.`,
        });
      }
      conflictIds.add(conflict.id);
      if (conflict.entityId && !entityIds.has(conflict.entityId)) {
        context.addIssue({
          code: "custom",
          path: ["conflicts", index, "entityId"],
          message: `Unknown conflict entity '${conflict.entityId}'.`,
        });
      }
    }
  });

const EntityChangesSchema = z
  .strictObject({
    name: z.string().trim().min(1).optional(),
    kind: identifierSchema.optional(),
    assetKey: identifierSchema.optional(),
    dimensions: positiveVector3Schema.optional(),
    state: jsonRecordSchema.optional(),
    transform: TransformSchema.optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, "Entity changes cannot be empty.");

export const PatchOperationSchema = z.discriminatedUnion("op", [
  z.looseObject({ op: z.literal("add_entity"), entity: EntitySchema }),
  z.looseObject({ op: z.literal("remove_entity"), entityId: identifierSchema }),
  z.looseObject({
    op: z.literal("move_entity"),
    entityId: identifierSchema,
    position: vector3Schema,
    rotation: vector3Schema.optional(),
    locationId: identifierSchema.optional(),
  }),
  z.looseObject({
    op: z.literal("update_entity"),
    entityId: identifierSchema,
    changes: EntityChangesSchema,
  }),
  z.looseObject({ op: z.literal("add_relation"), relation: SpatialRelationSchema }),
  z.looseObject({ op: z.literal("remove_relation"), relationId: identifierSchema }),
]);

export const ScenePatchSchema = z
  .strictObject({
    fromVersion: z.number().int().nonnegative(),
    toVersion: z.number().int().nonnegative(),
    operations: z.array(PatchOperationSchema),
  })
  .superRefine((patch, context) => {
    if (patch.toVersion <= patch.fromVersion) {
      context.addIssue({
        code: "custom",
        path: ["toVersion"],
        message: "toVersion must be greater than fromVersion.",
      });
    }
  });

export type ContractName = "WorldSnapshot" | "ScenePatch";

export class ContractValidationError extends Error {
  readonly contract: ContractName;
  readonly issues: readonly string[];

  constructor(contract: ContractName, issues: readonly string[]) {
    super(`${contract} validation failed: ${issues.join("; ")}`);
    this.name = "ContractValidationError";
    this.contract = contract;
    this.issues = issues;
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

export function validateWorldSnapshot(value: unknown): WorldSnapshot {
  const result = WorldSnapshotSchema.safeParse(value);
  if (!result.success) {
    throw new ContractValidationError("WorldSnapshot", formatIssues(result.error));
  }
  return result.data as WorldSnapshot;
}

export function validateScenePatch(value: unknown): ScenePatch {
  const result = ScenePatchSchema.safeParse(value);
  if (!result.success) {
    throw new ContractValidationError("ScenePatch", formatIssues(result.error));
  }
  return result.data as ScenePatch;
}
