import type { SpatialPredicate, WorldSnapshot } from "../contracts/world";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import {
  resolveApprovedAssetLibrary,
  type ApprovedAssetSelection,
  type StoryStyleKit,
} from "./approvedAssetLibrary";
import type { AssetRegistry } from "./assetRegistry";
import {
  buildSceneManifest,
  type SceneAssetGenerationJob,
} from "./sceneBuildPipeline";
import type {
  SceneDressingModuleId,
  SceneEnvironmentModuleId,
  SceneModuleSelection,
  ScenePresentation,
} from "./sceneCompiler";
import {
  auditSceneComposition,
  type SceneCompositionAudit,
} from "./sceneCompositionAudit";

export type PlacementConstraintKind =
  | "avoid_overlap"
  | "anchor_to_surface"
  | "contain_inside"
  | "face_target"
  | "anchor_to_wall"
  | "reserve_access_zone"
  | "center_in_room";

export interface ScenePlacementConstraint {
  kind: PlacementConstraintKind;
  entityId?: string;
  targetEntityId?: string;
  relationId?: string;
  predicate?: SpatialPredicate | (string & {});
  wall?: "north" | "south" | "east" | "west";
}

export interface LocationSceneRecipe {
  locationId: string;
  presentation: ScenePresentation;
  environmentModules: SceneModuleSelection<SceneEnvironmentModuleId>[];
  dressingModules: SceneModuleSelection<SceneDressingModuleId>[];
}

export interface SceneAssetCoverage {
  total: number;
  approved: number;
  designedFallback: number;
  queuedForGeneration: number;
  approvedPercent: number;
}

export interface CompiledSceneRecipe {
  schemaVersion: "1.0";
  storyId: string;
  segmentId: string;
  snapshotVersion: number;
  planVersion: number;
  status: "ready" | "assets_pending" | "needs_visual_plan";
  styleKit: StoryStyleKit;
  locations: Readonly<Record<string, LocationSceneRecipe>>;
  assetRegistry: AssetRegistry;
  approvedAssets: ApprovedAssetSelection[];
  fallbackEntityIds: string[];
  generationJobs: SceneAssetGenerationJob[];
  placementConstraints: ScenePlacementConstraint[];
  composition: SceneCompositionAudit;
  coverage: SceneAssetCoverage;
}

const FACING_PREDICATES = new Set(["left_of", "right_of", "in_front_of", "behind", "near"]);

function looksLikeDoor(name: string, aliases: readonly string[] = []): boolean {
  return [name, ...aliases].some((value) => /\b(door|gate|portal|hatch)\b/i.test(value));
}

/** Converts factual spatial relations into renderer rules without inventing new relations. */
export function compilePlacementConstraints(snapshot: WorldSnapshot): ScenePlacementConstraint[] {
  const entities = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  const constraints: ScenePlacementConstraint[] = [{ kind: "avoid_overlap" }];

  for (const relation of snapshot.relations) {
    const subject = entities.get(relation.subjectId);
    if (!subject) continue;

    if (relation.predicate === "on" && relation.objectId) {
      constraints.push({
        kind: "anchor_to_surface",
        entityId: subject.id,
        targetEntityId: relation.objectId,
        relationId: relation.id,
        predicate: relation.predicate,
      });
    }
    if (relation.predicate === "inside" && relation.objectId) {
      constraints.push({
        kind: "contain_inside",
        entityId: subject.id,
        targetEntityId: relation.objectId,
        relationId: relation.id,
        predicate: relation.predicate,
      });
    }
    if (subject.kind === "furniture" && relation.objectId && FACING_PREDICATES.has(relation.predicate)) {
      constraints.push({
        kind: "face_target",
        entityId: subject.id,
        targetEntityId: relation.objectId,
        relationId: relation.id,
        predicate: relation.predicate,
      });
    }
    if (relation.predicate === "against_wall") {
      constraints.push({
        kind: "anchor_to_wall",
        entityId: subject.id,
        relationId: relation.id,
        predicate: relation.predicate,
        wall: relation.metadata?.wall,
      });
      if (looksLikeDoor(subject.name, subject.aliases)) {
        constraints.push({
          kind: "reserve_access_zone",
          entityId: subject.id,
          relationId: relation.id,
          predicate: relation.predicate,
          wall: relation.metadata?.wall,
        });
      }
    }
    if (relation.predicate === "centered") {
      constraints.push({
        kind: "center_in_room",
        entityId: subject.id,
        relationId: relation.id,
        predicate: relation.predicate,
      });
    }
  }

  return constraints;
}

/**
 * Single compilation boundary from Part 1 data to an executable world recipe.
 * The recipe selects only registered renderer modules and approved assets;
 * unsupported canonical entities remain explicit fallbacks/generation jobs.
 */
export function compileSceneRecipe(
  snapshot: WorldSnapshot,
  plan: VisualScenePlan,
): CompiledSceneRecipe {
  const approved = resolveApprovedAssetLibrary(snapshot, plan);
  const manifest = buildSceneManifest(snapshot, plan, [], approved.assetRegistry);
  const locations = Object.fromEntries(
    Object.entries(manifest.presentations).map(([locationId, presentation]) => [
      locationId,
      {
        locationId,
        presentation,
        environmentModules: presentation.modules.environment,
        dressingModules: presentation.modules.dressing,
      },
    ]),
  );
  const total = snapshot.entities.length;
  const approvedCount = approved.selections.length;
  const composition = auditSceneComposition(
    snapshot,
    manifest.presentations,
    manifest.assetRegistry,
  );

  return {
    schemaVersion: "1.0",
    storyId: snapshot.storyId,
    segmentId: plan.segmentId,
    snapshotVersion: snapshot.version,
    planVersion: plan.planVersion,
    status: manifest.status,
    styleKit: approved.styleKit,
    locations,
    assetRegistry: manifest.assetRegistry,
    approvedAssets: approved.selections,
    fallbackEntityIds: approved.unresolvedEntityIds,
    generationJobs: manifest.generationJobs,
    placementConstraints: compilePlacementConstraints(snapshot),
    composition,
    coverage: {
      total,
      approved: approvedCount,
      designedFallback: approved.unresolvedEntityIds.length,
      queuedForGeneration: manifest.generationJobs.length,
      approvedPercent: total === 0 ? 100 : Math.round((approvedCount / total) * 100),
    },
  };
}
