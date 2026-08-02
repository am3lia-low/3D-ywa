import { describe, expect, it } from "vitest";
import modelManifest from "../../public/models/manifest.json";
import type { Entity } from "../contracts/world";
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
  it("keeps every registered model URL synchronized with the generated manifest", () => {
    const manifestUrls = new Set(modelManifest.assets.map((asset) => asset.url));
    const registeredUrls = Object.values(defaultAssetRegistry).flatMap((asset) =>
      asset.modelUrl ? [asset.modelUrl] : [],
    );

    expect(registeredUrls).toHaveLength(6);
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
});
