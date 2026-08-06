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
import {
  createSceneAssetOutcomeReport,
  type SceneAssetOutcomeReport,
} from "./sceneAssetOutcome";
import { resolveDressingInstances, type ResolvedDressingInstance } from "./dressingResolver";
import { createWorldLayout } from "./layoutEngine";
import {
  resolvePromotedStoryAssets,
  type PromotedStoryAssetCatalog,
  type PromotedStoryAsset,
} from "./promotedStoryAssets";

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
  dressingInstances: ResolvedDressingInstance[];
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
  promotedAssets: PromotedStoryAsset[];
  assetOutcomes: SceneAssetOutcomeReport;
  fallbackEntityIds: string[];
  generationJobs: SceneAssetGenerationJob[];
  placementConstraints: ScenePlacementConstraint[];
  composition: SceneCompositionAudit;
  coverage: SceneAssetCoverage;
}

export interface CompileSceneRecipeOptions {
  promotedAssetCatalog?: PromotedStoryAssetCatalog;
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
  options: CompileSceneRecipeOptions = {},
): CompiledSceneRecipe {
  const approved = resolveApprovedAssetLibrary(snapshot, plan);
  const promoted = resolvePromotedStoryAssets(snapshot, options.promotedAssetCatalog);
  const baseRegistry = { ...approved.assetRegistry, ...promoted.assetRegistry };
  const promotedByEntityId = new Map(
    promoted.selections.map((selection) => [selection.entityId, selection]),
  );
  const builtManifest = buildSceneManifest(snapshot, plan, [], baseRegistry);
  const manifest = {
    ...builtManifest,
    resolvedAssets: builtManifest.resolvedAssets.map((resolved) => {
      const selection = promotedByEntityId.get(resolved.entityId);
      return selection
        ? { ...resolved, source: "generated" as const, catalogId: selection.promotionId }
        : resolved;
    }),
  };
  const locations = Object.fromEntries(
    Object.entries(manifest.presentations).map(([locationId, presentation]) => {
      const layout = createWorldLayout(snapshot, manifest.assetRegistry, [], locationId);
      return [
        locationId,
        {
          locationId,
          presentation,
          environmentModules: presentation.modules.environment,
          dressingModules: presentation.modules.dressing,
          dressingInstances: resolveDressingInstances(layout, presentation, approved.styleKit.id),
        },
      ];
    }),
  );
  const total = snapshot.entities.length;
  const approvedEntityIds = new Set([
    ...approved.selections.map((selection) => selection.entityId),
    ...promoted.selections.map((selection) => selection.entityId),
  ]);
  const promotedEntityIds = new Set(promoted.selections.map((selection) => selection.entityId));
  const activeApprovedSelections = approved.selections.filter(
    (selection) => !promotedEntityIds.has(selection.entityId),
  );
  const fallbackEntityIds = approved.unresolvedEntityIds.filter(
    (entityId) => !promotedEntityIds.has(entityId),
  );
  const approvedCount = approvedEntityIds.size;
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
    approvedAssets: activeApprovedSelections,
    promotedAssets: promoted.selections,
    assetOutcomes: createSceneAssetOutcomeReport(snapshot, plan, manifest),
    fallbackEntityIds,
    generationJobs: manifest.generationJobs,
    placementConstraints: compilePlacementConstraints(snapshot),
    composition,
    coverage: {
      total,
      approved: approvedCount,
      designedFallback: fallbackEntityIds.length,
      queuedForGeneration: manifest.generationJobs.length,
      approvedPercent: total === 0 ? 100 : Math.round((approvedCount / total) * 100),
    },
  };
}
