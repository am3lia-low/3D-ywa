import type { VisualEntityPlan, VisualScenePlan } from "../contracts/visualScenePlan";
import type { Entity, WorldSnapshot } from "../contracts/world";
import type { AssetDefinition, AssetRegistry } from "./assetRegistry";
import { assetKitCatalog, catalogAssetDefinition } from "./assetKitCatalog";

export interface StoryStyleKit {
  id: string;
  label: string;
  description: string;
  matchTags: string[];
}

export interface ApprovedAssetEntry {
  catalogId: string;
  asset: AssetDefinition;
  assetKeys: string[];
  semanticKinds: string[];
  tags: string[];
  styleKitIds: string[];
  placement: "floor" | "wall" | "surface" | "free";
  source: "project" | "cc0";
  author: string;
  license: string;
  quality: "supporting" | "hero";
}

export interface ApprovedAssetSelection {
  entityId: string;
  catalogId: string;
  registryKey: string;
  reason: "canonical_asset_key" | "semantic_match";
  source: ApprovedAssetEntry["source"];
  license: string;
}

export interface ApprovedAssetResolution {
  styleKit: StoryStyleKit;
  assetRegistry: AssetRegistry;
  selections: ApprovedAssetSelection[];
  unresolvedEntityIds: string[];
}

export const storyStyleKits: readonly StoryStyleKit[] = assetKitCatalog.kits.map(
  ({ id, label, description, matchTags }) => ({ id, label, description, matchTags }),
);

export const approvedAssetEntries: readonly ApprovedAssetEntry[] = assetKitCatalog.assets.map(
  (entry) => ({
    catalogId: entry.catalogId,
    asset: catalogAssetDefinition(entry),
    assetKeys: entry.assetKeys,
    semanticKinds: entry.semanticKinds,
    tags: entry.tags,
    styleKitIds: entry.styleKitIds,
    placement: entry.placement,
    source: entry.source,
    author: entry.author,
    license: entry.license,
    quality: entry.quality,
  }),
);

function tokens(values: readonly string[]): Set<string> {
  return new Set(
    values.flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)),
  );
}

export function selectStoryStyleKit(plan: VisualScenePlan): StoryStyleKit {
  const requested = tokens([
    plan.artDirection.styleLabel,
    plan.artDirection.stylePrompt,
    ...plan.artDirection.materialVocabulary,
    ...plan.locations.flatMap((location) => [location.archetype, ...location.architectureTags]),
  ]);
  return storyStyleKits
    .map((kit) => ({
      kit,
      score: kit.matchTags.reduce((score, tag) => score + (requested.has(tag) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score || left.kit.id.localeCompare(right.kit.id))[0]!
    .kit;
}

function scoreEntry(
  entry: ApprovedAssetEntry,
  entity: Entity,
  visual: VisualEntityPlan | undefined,
  styleKitId: string,
): { score: number; exact: boolean; eligible: boolean } {
  const requestedAssetKey = entity.assetKey?.toLowerCase();
  const exact = Boolean(requestedAssetKey && entry.assetKeys.includes(requestedAssetKey));
  const requested = tokens([
    entity.kind,
    entity.name,
    ...(entity.aliases ?? []),
    visual?.visualDescription ?? "",
    ...(visual?.materials ?? []),
    ...(visual?.colors ?? []),
    ...(visual?.assetSearchTags ?? []),
  ]);
  const available = tokens([...entry.assetKeys, ...entry.semanticKinds, ...entry.tags]);
  const kindMatch = entry.semanticKinds.includes(entity.kind.toLowerCase());
  let overlap = 0;
  for (const token of requested) if (available.has(token)) overlap += 1;
  let score = exact ? 1_000 : 0;
  if (entry.styleKitIds.includes(styleKitId)) score += 25;
  if (kindMatch) score += 20;
  score += overlap * 2;
  return { score, exact, eligible: exact || kindMatch || overlap >= 2 };
}

/** Selects only pre-approved assets and installs them under canonical entity IDs. */
export function resolveApprovedAssetLibrary(
  snapshot: WorldSnapshot,
  plan: VisualScenePlan,
  entries: readonly ApprovedAssetEntry[] = approvedAssetEntries,
): ApprovedAssetResolution {
  const styleKit = selectStoryStyleKit(plan);
  const visualById = new Map(plan.entities.map((entity) => [entity.entityId, entity]));
  const assetRegistry: Record<string, AssetDefinition> = {};
  const selections: ApprovedAssetSelection[] = [];
  const unresolvedEntityIds: string[] = [];

  for (const entity of snapshot.entities) {
    const match = entries
      .map((entry) => ({ entry, ...scoreEntry(entry, entity, visualById.get(entity.id), styleKit.id) }))
      .filter((candidate) => candidate.eligible)
      .sort(
        (left, right) =>
          right.score - left.score || left.entry.catalogId.localeCompare(right.entry.catalogId),
      )[0];
    if (!match) {
      unresolvedEntityIds.push(entity.id);
      continue;
    }
    assetRegistry[entity.id] = match.entry.asset;
    selections.push({
      entityId: entity.id,
      catalogId: match.entry.catalogId,
      registryKey: entity.id,
      reason: match.exact ? "canonical_asset_key" : "semantic_match",
      source: match.entry.source,
      license: match.entry.license,
    });
  }

  return { styleKit, assetRegistry, selections, unresolvedEntityIds };
}
