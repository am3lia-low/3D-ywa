import { z } from "zod";
import catalogFixture from "../data/asset-kit-catalog.json";
import safeMeshSupportFixture from "../data/safe-mesh-support.json";
import type { AssetDefinition } from "./assetRegistry";

const identifierSchema = z.string().trim().min(1);
const runtimeAssetSchema = z.strictObject({
  key: identifierSchema,
  geometry: z.enum(["box", "cylinder", "sphere"]),
  dimensions: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  color: identifierSchema,
  modelUrl: z.string().trim().min(1).optional(),
  lods: z.array(z.strictObject({
    modelUrl: z.string().trim().min(1),
    minimumDistance: z.number().nonnegative(),
  })).min(2).optional(),
  safeMeshUrl: z.string().trim().min(1).optional(),
  surfaceTextureUrl: z.string().trim().min(1).optional(),
  surfaceCrop: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  supportSurfaceY: z.number().min(0).max(1).optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
});

export const AssetKitCatalogSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  kits: z.array(z.strictObject({
    id: identifierSchema,
    label: identifierSchema,
    description: identifierSchema,
    matchTags: z.array(identifierSchema),
    requiredRoles: z.array(identifierSchema),
  })).min(1),
  assets: z.array(z.strictObject({
    catalogId: identifierSchema,
    registryKey: identifierSchema,
    roles: z.array(identifierSchema).min(1),
    assetKeys: z.array(identifierSchema).min(1),
    semanticKinds: z.array(identifierSchema).min(1),
    tags: z.array(identifierSchema).min(1),
    styleKitIds: z.array(identifierSchema).min(1),
    placement: z.enum(["floor", "wall", "surface", "free"]),
    source: z.enum(["project", "cc0"]),
    author: identifierSchema,
    license: identifierSchema,
    sourceUrl: z.string().url().optional(),
    quality: z.enum(["supporting", "hero"]),
    runtimeAsset: runtimeAssetSchema,
    qualityGate: z.strictObject({
      profile: z.enum(["textured-pbr", "stylized-project", "surface-template"]),
      maxTotalBytes: z.number().int().positive(),
      maxTriangles: z.number().int().positive(),
      requirePbrTextures: z.boolean(),
      maxAspectDistortion: z.number().min(1),
      expectedUpAxis: z.literal("Y"),
      expectedForwardAxis: z.enum(["+Z", "-Z"]),
      waiver: z.string().trim().min(1).optional(),
    }),
  })).min(1),
}).superRefine((catalog, context) => {
  const kitIds = new Set<string>();
  catalog.kits.forEach((kit, index) => {
    if (kitIds.has(kit.id)) {
      context.addIssue({ code: "custom", path: ["kits", index, "id"], message: `Duplicate kit '${kit.id}'.` });
    }
    kitIds.add(kit.id);
  });
  const catalogIds = new Set<string>();
  const registryKeys = new Set<string>();
  catalog.assets.forEach((asset, index) => {
    if (catalogIds.has(asset.catalogId)) {
      context.addIssue({ code: "custom", path: ["assets", index, "catalogId"], message: `Duplicate catalog ID '${asset.catalogId}'.` });
    }
    if (registryKeys.has(asset.registryKey)) {
      context.addIssue({ code: "custom", path: ["assets", index, "registryKey"], message: `Duplicate registry key '${asset.registryKey}'.` });
    }
    catalogIds.add(asset.catalogId);
    registryKeys.add(asset.registryKey);
    asset.styleKitIds.forEach((kitId) => {
      if (!kitIds.has(kitId)) {
        context.addIssue({ code: "custom", path: ["assets", index, "styleKitIds"], message: `Unknown style kit '${kitId}'.` });
      }
    });
    if (asset.source === "cc0" && !asset.sourceUrl) {
      context.addIssue({ code: "custom", path: ["assets", index, "sourceUrl"], message: "CC0 assets require a source URL." });
    }
    if (!asset.runtimeAsset.modelUrl && !asset.runtimeAsset.safeMeshUrl && !asset.runtimeAsset.surfaceTextureUrl) {
      context.addIssue({ code: "custom", path: ["assets", index, "runtimeAsset"], message: "An asset requires a model or controlled surface texture." });
    }
    if (asset.runtimeAsset.lods) {
      if (!asset.runtimeAsset.modelUrl) {
        context.addIssue({ code: "custom", path: ["assets", index, "runtimeAsset", "lods"], message: "LOD assets require a primary model URL." });
      }
      if (asset.runtimeAsset.lods[0]?.minimumDistance !== 0) {
        context.addIssue({ code: "custom", path: ["assets", index, "runtimeAsset", "lods", 0], message: "The nearest LOD must start at distance zero." });
      }
      if (asset.runtimeAsset.lods[0]?.modelUrl !== asset.runtimeAsset.modelUrl) {
        context.addIssue({ code: "custom", path: ["assets", index, "runtimeAsset", "lods", 0], message: "The primary model URL must match LOD0." });
      }
      asset.runtimeAsset.lods.forEach((lod, lodIndex) => {
        if (lodIndex > 0 && lod.minimumDistance <= asset.runtimeAsset.lods![lodIndex - 1]!.minimumDistance) {
          context.addIssue({ code: "custom", path: ["assets", index, "runtimeAsset", "lods", lodIndex], message: "LOD distances must increase from near to far." });
        }
      });
    }
  });
  catalog.kits.forEach((kit, index) => {
    const roles = new Set(
      catalog.assets
        .filter((asset) => asset.styleKitIds.includes(kit.id))
        .flatMap((asset) => asset.roles),
    );
    kit.requiredRoles.forEach((role) => {
      if (!roles.has(role)) {
        context.addIssue({ code: "custom", path: ["kits", index, "requiredRoles"], message: `Kit '${kit.id}' is missing role '${role}'.` });
      }
    });
  });
});

export type AssetKitCatalog = z.infer<typeof AssetKitCatalogSchema>;
export type AssetKitCatalogAsset = AssetKitCatalog["assets"][number];

export function validateAssetKitCatalog(value: unknown): AssetKitCatalog {
  return AssetKitCatalogSchema.parse(value);
}

export const assetKitCatalog = validateAssetKitCatalog(catalogFixture);

export function catalogAssetDefinition(asset: AssetKitCatalogAsset): AssetDefinition {
  const generated = asset.runtimeAsset.safeMeshUrl
    ? safeMeshSupportFixture.assets[
        asset.runtimeAsset.safeMeshUrl as keyof typeof safeMeshSupportFixture.assets
      ]
    : undefined;
  return {
    ...asset.runtimeAsset,
    supportSurfaceY: asset.runtimeAsset.supportSurfaceY ?? generated?.supportSurfaceY,
  } as AssetDefinition;
}
