import type { VisualEntityPlan, VisualScenePlan } from "../contracts/visualScenePlan";
import type { Entity, WorldSnapshot } from "../contracts/world";
import { defaultAssetRegistry, type AssetDefinition, type AssetRegistry } from "./assetRegistry";

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

export const storyStyleKits: readonly StoryStyleKit[] = [
  {
    id: "storybook-historical",
    label: "Grounded storybook historical",
    description: "Warm, tactile period interiors with aged natural materials and readable silhouettes.",
    matchTags: ["storybook", "historical", "aged", "antique", "oak", "timber", "parchment"],
  },
  {
    id: "generic-grounded",
    label: "Grounded neutral",
    description: "A restrained fallback kit for stories without a selected art direction.",
    matchTags: [],
  },
];

function requiredAsset(key: string): AssetDefinition {
  const asset = defaultAssetRegistry[key];
  if (!asset) throw new Error(`Approved asset '${key}' is missing from the runtime registry.`);
  return asset;
}

export const approvedAssetEntries: readonly ApprovedAssetEntry[] = [
  {
    catalogId: "polyhaven:wooden_table_02",
    asset: requiredAsset("desk"),
    assetKeys: ["desk", "writing-desk", "table"],
    semanticKinds: ["desk", "furniture", "table"],
    tags: ["desk", "writing", "table", "wood", "oak", "antique", "worn", "historical"],
    styleKitIds: ["storybook-historical", "generic-grounded"],
    placement: "floor",
    source: "cc0",
    author: "Serhii Khromov",
    license: "CC0 1.0 Universal",
    quality: "hero",
  },
  {
    catalogId: "polyhaven:WoodenChair_01",
    asset: requiredAsset("chair"),
    assetKeys: ["chair", "wooden-chair", "armchair"],
    semanticKinds: ["chair", "furniture", "seat"],
    tags: ["chair", "seat", "wood", "oak", "antique", "worn", "historical"],
    styleKitIds: ["storybook-historical", "generic-grounded"],
    placement: "floor",
    source: "cc0",
    author: "Jake Mobley",
    license: "CC0 1.0 Universal",
    quality: "hero",
  },
  {
    catalogId: "project:stone-hearth-v1",
    asset: requiredAsset("fireplace"),
    assetKeys: ["fireplace", "hearth"],
    semanticKinds: ["architecture", "fireplace", "hearth"],
    tags: ["fireplace", "hearth", "stone", "soot", "old", "historical"],
    styleKitIds: ["storybook-historical", "generic-grounded"],
    placement: "wall",
    source: "project",
    author: "Persistent StoryWorld 3D team",
    license: "Project-owned original asset",
    quality: "hero",
  },
  {
    catalogId: "project:worn-red-rug-v1",
    asset: requiredAsset("rug"),
    assetKeys: ["rug", "carpet"],
    semanticKinds: ["decor", "rug", "carpet"],
    tags: ["rug", "carpet", "wool", "red", "faded", "woven", "historical"],
    styleKitIds: ["storybook-historical", "generic-grounded"],
    placement: "floor",
    source: "project",
    author: "Persistent StoryWorld 3D team",
    license: "Project-owned original asset",
    quality: "supporting",
  },
  {
    catalogId: "project:parchment-map-v1",
    asset: requiredAsset("map-1"),
    assetKeys: ["map", "document", "parchment"],
    semanticKinds: ["document", "map", "paper"],
    tags: ["map", "document", "paper", "parchment", "ink", "folded", "antique"],
    styleKitIds: ["storybook-historical", "generic-grounded"],
    placement: "surface",
    source: "project",
    author: "Persistent StoryWorld 3D team",
    license: "Project-owned original asset",
    quality: "supporting",
  },
  {
    catalogId: "project:brass-lantern-v2",
    asset: requiredAsset("lantern"),
    assetKeys: ["lantern", "lamp"],
    semanticKinds: ["light", "lantern", "lamp"],
    tags: ["lantern", "lamp", "brass", "glass", "aged", "historical"],
    styleKitIds: ["storybook-historical", "generic-grounded"],
    placement: "surface",
    source: "project",
    author: "Persistent StoryWorld 3D team",
    license: "Project-owned original asset",
    quality: "hero",
  },
  {
    catalogId: "project:hidden-oak-door-v1",
    asset: requiredAsset("hidden-door"),
    assetKeys: ["hidden-door", "door", "portal"],
    semanticKinds: ["architecture", "door", "portal"],
    tags: ["door", "hidden", "oak", "timber", "wall", "historical"],
    styleKitIds: ["storybook-historical", "generic-grounded"],
    placement: "wall",
    source: "project",
    author: "Persistent StoryWorld 3D team",
    license: "Project-owned original asset",
    quality: "hero",
  },
];

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
