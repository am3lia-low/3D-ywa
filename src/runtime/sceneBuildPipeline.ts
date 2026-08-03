import type { Entity, Vector3Tuple, WorldSnapshot } from "../contracts/world";
import type { VisualEntityPlan, VisualScenePlan } from "../contracts/visualScenePlan";
import {
  defaultAssetRegistry,
  type AssetDefinition,
  type AssetRegistry,
} from "./assetRegistry";
import {
  compileScenePresentation,
  type AssetGenerationRequest,
  type ScenePresentation,
  visualAssetPrompt,
} from "./sceneCompiler";

export interface SceneAssetCatalogEntry {
  catalogId: string;
  asset: AssetDefinition;
  tags: string[];
  entityKinds?: string[];
  source: "project" | "cc0" | "generated";
}

export interface ResolvedSceneAsset {
  entityId: string;
  assetKey: string;
  registryKey: string;
  source: "registry" | SceneAssetCatalogEntry["source"];
  catalogId?: string;
}

export interface SceneAssetGenerationJob extends AssetGenerationRequest {
  locationId: string;
  entityKind: string;
  dimensions?: Vector3Tuple;
  strategy: "image_to_mesh" | "surface_template";
  reason: "no_catalog_match";
}

const SURFACE_ENTITY_KINDS = new Set([
  "architecture",
  "document",
  "map",
  "painting",
  "poster",
  "rug",
  "tapestry",
]);

export function chooseSceneAssetStrategy(entity: Entity): SceneAssetGenerationJob["strategy"] {
  if (SURFACE_ENTITY_KINDS.has(entity.kind.toLowerCase())) return "surface_template";
  const dimensions = entity.dimensions;
  if (dimensions) {
    const sorted = [...dimensions].sort((left, right) => left - right);
    if (sorted[0]! / sorted[2]! <= 0.12) return "surface_template";
  }
  return "image_to_mesh";
}

export interface SceneBuildManifest {
  schemaVersion: "1.0";
  storyId: string;
  segmentId: string;
  snapshotVersion: number;
  planVersion: number;
  status: "ready" | "assets_pending" | "needs_visual_plan";
  presentations: Readonly<Record<string, ScenePresentation>>;
  assetRegistry: AssetRegistry;
  resolvedAssets: ResolvedSceneAsset[];
  generationJobs: SceneAssetGenerationJob[];
  missingVisualEntityIds: string[];
}

function normalizedTags(values: readonly string[]): Set<string> {
  return new Set(
    values.flatMap((value) =>
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    ),
  );
}

function catalogScore(
  entry: SceneAssetCatalogEntry,
  entity: Entity,
  visual: VisualEntityPlan,
): number {
  const requested = normalizedTags([
    entity.kind,
    visual.visualDescription,
    ...visual.assetSearchTags,
    ...visual.materials,
  ]);
  const available = normalizedTags(entry.tags);
  let score = entry.entityKinds?.includes(entity.kind) ? 4 : 0;
  for (const tag of requested) if (available.has(tag)) score += 1;
  return score;
}

function registeredAsset(
  entity: Entity,
  registry: AssetRegistry,
): { registryKey: string; asset: AssetDefinition } | undefined {
  for (const key of [entity.id, entity.assetKey, entity.kind]) {
    if (key && registry[key]) return { registryKey: key, asset: registry[key] };
  }
  return undefined;
}

/**
 * Converts Part 1's factual + visual output into an executable spatial build.
 * Existing assets resolve immediately; missing visual assets become explicit
 * asynchronous jobs without inventing new narrative identities.
 */
export function buildSceneManifest(
  snapshot: WorldSnapshot,
  plan: VisualScenePlan,
  catalog: readonly SceneAssetCatalogEntry[] = [],
  baseRegistry: AssetRegistry = defaultAssetRegistry,
): SceneBuildManifest {
  const presentations = Object.fromEntries(
    plan.locations.map((location) => [
      location.locationId,
      compileScenePresentation(plan, snapshot, location.locationId),
    ]),
  );
  const visualById = new Map(plan.entities.map((entity) => [entity.entityId, entity]));
  let registry: AssetRegistry = baseRegistry;
  const resolvedAssets: ResolvedSceneAsset[] = [];
  const generationJobs: SceneAssetGenerationJob[] = [];
  const missingVisualEntityIds: string[] = [];

  for (const entity of snapshot.entities) {
    const registered = registeredAsset(entity, registry);
    if (registered) {
      resolvedAssets.push({
        entityId: entity.id,
        assetKey: registered.asset.key,
        registryKey: registered.registryKey,
        source: "registry",
      });
      continue;
    }

    const visual = visualById.get(entity.id);
    if (!visual) {
      missingVisualEntityIds.push(entity.id);
      continue;
    }

    const match = catalog
      .map((entry) => ({ entry, score: catalogScore(entry, entity, visual) }))
      .filter((candidate) => candidate.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.entry.catalogId.localeCompare(right.entry.catalogId),
      )[0]?.entry;

    if (match) {
      registry = { ...registry, [entity.id]: match.asset };
      resolvedAssets.push({
        entityId: entity.id,
        assetKey: match.asset.key,
        registryKey: entity.id,
        source: match.source,
        catalogId: match.catalogId,
      });
      continue;
    }

    if (visual.importance !== "background") {
      generationJobs.push({
        entityId: entity.id,
        locationId: entity.locationId,
        entityKind: entity.kind,
        dimensions: entity.dimensions,
        strategy: chooseSceneAssetStrategy(entity),
        prompt: visualAssetPrompt(visual),
        searchTags: visual.assetSearchTags,
        priority: visual.importance,
        reason: "no_catalog_match",
      });
    }
  }

  return {
    schemaVersion: "1.0",
    storyId: snapshot.storyId,
    segmentId: plan.segmentId,
    snapshotVersion: snapshot.version,
    planVersion: plan.planVersion,
    status:
      missingVisualEntityIds.length > 0
        ? "needs_visual_plan"
        : generationJobs.length > 0
          ? "assets_pending"
          : "ready",
    presentations,
    assetRegistry: registry,
    resolvedAssets,
    generationJobs,
    missingVisualEntityIds,
  };
}
