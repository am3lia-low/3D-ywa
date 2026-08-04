import { describe, expect, it } from "vitest";
import modelManifest from "../../public/models/manifest.json";
import type { Entity } from "../contracts/world";
import { assetKitCatalog } from "./assetKitCatalog";
import { defaultAssetRegistry, resolveAsset } from "./assetRegistry";

function entity(overrides: Partial<Entity>): Entity {
  return {
    id: "test-entity",
    name: "Test entity",
    kind: "unknown",
    locationId: "test-room",
    ...overrides,
  };
}

describe("asset registry", () => {
  it("keeps every registered runtime asset URL synchronized with the generated manifest", () => {
    const manifestUrls = new Set(modelManifest.assets.map((asset) => asset.url));
    const registeredUrls = Object.values(defaultAssetRegistry).flatMap((asset) =>
      [
        asset.modelUrl,
        asset.safeMeshUrl,
        asset.surfaceTextureUrl,
        ...(asset.lods?.map((lod) => lod.modelUrl) ?? []),
      ].filter((url): url is string => Boolean(url)),
    );

    const catalogUrls = assetKitCatalog.assets.flatMap((asset) =>
      [
        asset.runtimeAsset.modelUrl,
        asset.runtimeAsset.safeMeshUrl,
        asset.runtimeAsset.surfaceTextureUrl,
        ...(asset.runtimeAsset.lods?.map((lod) => lod.modelUrl) ?? []),
      ]
        .filter((url): url is string => Boolean(url)),
    );

    expect(registeredUrls.sort()).toEqual(catalogUrls.sort());
    expect(registeredUrls.every((url) => manifestUrls.has(url))).toBe(true);
  });

  it("retains a model while honoring entity-specific physical dimensions", () => {
    const asset = resolveAsset(
      entity({ assetKey: "desk", dimensions: [3, 1.4, 1.2] }),
    );

    expect(asset.modelUrl).toBe(
      "/models/polyhaven/wooden_table_02/wooden_table_02_1k.gltf",
    );
    expect(asset.dimensions).toEqual([3, 1.4, 1.2]);
  });

  it("returns a primitive-only fallback for an unknown semantic asset", () => {
    const asset = resolveAsset(entity({ kind: "mysterious-relic" }));

    expect(asset.key).toBe("fallback:mysterious-relic");
    expect(asset.modelUrl).toBeUndefined();
    expect(asset.geometry).toBe("box");
  });

  it("gives unknown semantic objects useful real-world proportions", () => {
    expect(resolveAsset(entity({ kind: "character", name: "A stranger" })).dimensions).toEqual([
      0.62,
      1.75,
      0.5,
    ]);
    expect(resolveAsset(entity({ kind: "document", name: "A letter" })).dimensions[1]).toBe(0.08);
  });

  it("resolves converted safe meshes without exposing their rejected source GLB", () => {
    const asset = resolveAsset(entity({ kind: "tree", assetKey: "environment-tree-oak" }));

    expect(asset.safeMeshUrl).toBe("/models/converted/nature/tree-oak-safe.mesh.json");
    expect(asset.modelUrl).toBeUndefined();
  });
});
