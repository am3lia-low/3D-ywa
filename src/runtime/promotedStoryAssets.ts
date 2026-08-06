import { z } from "zod";

import promotedFixture from "../data/promoted-story-assets.json";
import type { WorldSnapshot } from "../contracts/world";
import type { AssetDefinition, AssetRegistry } from "./assetRegistry";

const identifierSchema = z.string().trim().min(1);
const assetDefinitionSchema = z.strictObject({
  key: identifierSchema,
  geometry: z.enum(["box", "cylinder", "sphere"]),
  dimensions: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  color: identifierSchema,
  modelUrl: identifierSchema.optional(),
  lods: z.array(z.strictObject({
    modelUrl: identifierSchema,
    minimumDistance: z.number().nonnegative(),
  })).optional(),
  safeMeshUrl: identifierSchema.optional(),
  surfaceTextureUrl: identifierSchema.optional(),
  surfaceCrop: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  proceduralModel: z.enum(["portrait", "bay-window", "silver-key", "amber-pendant", "canal", "door"]).optional(),
  supportSurfaceY: z.number().min(0).max(1).optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
});

export const PromotedStoryAssetCatalogSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  assets: z.array(z.strictObject({
    promotionId: identifierSchema,
    storyId: identifierSchema,
    entityId: identifierSchema,
    snapshotVersion: z.number().int().nonnegative(),
    planVersion: z.number().int().nonnegative(),
    artifactId: identifierSchema.optional(),
    promotedAt: z.string().datetime(),
    referenceProviderId: identifierSchema,
    reconstructionProviderId: identifierSchema,
    referenceReviewedAt: z.string().datetime(),
    assetReviewedAt: z.string().datetime(),
    runtimeAsset: assetDefinitionSchema,
  })),
}).superRefine((catalog, context) => {
  const ids = new Set<string>();
  catalog.assets.forEach((asset, index) => {
    if (ids.has(asset.promotionId)) {
      context.addIssue({
        code: "custom",
        path: ["assets", index, "promotionId"],
        message: `Duplicate promotion ID '${asset.promotionId}'.`,
      });
    }
    ids.add(asset.promotionId);
    if (!asset.runtimeAsset.modelUrl && !asset.runtimeAsset.surfaceTextureUrl && !asset.runtimeAsset.safeMeshUrl && !asset.runtimeAsset.proceduralModel) {
      context.addIssue({
        code: "custom",
        path: ["assets", index, "runtimeAsset"],
        message: "A promoted asset must reference a durable runtime artifact.",
      });
    }
  });
});

export type PromotedStoryAssetCatalog = z.infer<typeof PromotedStoryAssetCatalogSchema>;
export type PromotedStoryAsset = PromotedStoryAssetCatalog["assets"][number];

export interface PromotedStoryAssetResolution {
  assetRegistry: AssetRegistry;
  selections: PromotedStoryAsset[];
}

export function validatePromotedStoryAssetCatalog(value: unknown): PromotedStoryAssetCatalog {
  return PromotedStoryAssetCatalogSchema.parse(value);
}

export const promotedStoryAssetCatalog = validatePromotedStoryAssetCatalog(promotedFixture);

/**
 * Resolves the newest reviewed story-specific asset that existed at or before
 * the active snapshot. Promotions never cross story or canonical entity IDs.
 */
export function resolvePromotedStoryAssets(
  snapshot: WorldSnapshot,
  catalog: PromotedStoryAssetCatalog = promotedStoryAssetCatalog,
): PromotedStoryAssetResolution {
  const canonicalIds = new Set(snapshot.entities.map((entity) => entity.id));
  const ranked = catalog.assets
    .filter((asset) =>
      asset.storyId === snapshot.storyId &&
      canonicalIds.has(asset.entityId) &&
      asset.snapshotVersion <= snapshot.version,
    )
    .sort((left, right) =>
      right.snapshotVersion - left.snapshotVersion ||
      right.planVersion - left.planVersion ||
      right.promotedAt.localeCompare(left.promotedAt) ||
      left.promotionId.localeCompare(right.promotionId),
    );
  const selections: PromotedStoryAsset[] = [];
  const seen = new Set<string>();
  for (const asset of ranked) {
    if (seen.has(asset.entityId)) continue;
    seen.add(asset.entityId);
    selections.push(asset);
  }
  return {
    selections,
    assetRegistry: Object.fromEntries(
      selections.map((asset) => [asset.entityId, asset.runtimeAsset as AssetDefinition]),
    ),
  };
}
