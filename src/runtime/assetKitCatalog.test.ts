import { describe, expect, it } from "vitest";

import { approvedAssetEntries, storyStyleKits } from "./approvedAssetLibrary";
import { assetKitCatalog, validateAssetKitCatalog } from "./assetKitCatalog";
import { defaultAssetRegistry } from "./assetRegistry";

describe("asset kit catalog", () => {
  it("is the single source for runtime assets and semantic entries", () => {
    expect(assetKitCatalog.kits).toHaveLength(5);
    expect(assetKitCatalog.kits.map((kit) => kit.id)).toContain("speculative-storybook");
    expect(assetKitCatalog.assets).toHaveLength(47);
    expect(Object.keys(defaultAssetRegistry).sort()).toEqual(
      assetKitCatalog.assets.map((asset) => asset.registryKey).sort(),
    );
    expect(approvedAssetEntries.map((entry) => entry.catalogId).sort()).toEqual(
      assetKitCatalog.assets.map((asset) => asset.catalogId).sort(),
    );
    expect(storyStyleKits.map((kit) => kit.id).sort()).toEqual(
      assetKitCatalog.kits.map((kit) => kit.id).sort(),
    );
  });

  it("covers every required role in each complete style kit", () => {
    for (const kit of assetKitCatalog.kits) {
      const covered = new Set(
        assetKitCatalog.assets
          .filter((asset) => asset.styleKitIds.includes(kit.id))
          .flatMap((asset) => asset.roles),
      );
      expect(kit.requiredRoles.filter((role) => !covered.has(role))).toEqual([]);
    }
  });

  it("carries measured support height for irregular support assets", () => {
    expect(defaultAssetRegistry["environment-fallen-log"]?.supportSurfaceY)
      .toBeCloseTo(0.747, 3);
  });

  it("publishes ordered browser LODs for optimized hero environment assets", () => {
    const streetLamp = defaultAssetRegistry["ornate-street-lamp"];
    expect(streetLamp?.lods).toEqual([
      expect.objectContaining({ minimumDistance: 0 }),
      expect.objectContaining({ minimumDistance: 14 }),
      expect.objectContaining({ minimumDistance: 30 }),
    ]);
    expect(streetLamp?.modelUrl).toBe(streetLamp?.lods?.[0]?.modelUrl);
  });

  it("retains complete provenance for vendored CC0 models", () => {
    const crate = assetKitCatalog.assets.find((asset) => asset.registryKey === "crate");
    expect(crate).toMatchObject({
      source: "cc0",
      license: "CC0 1.0 Universal",
      sourceUrl: "https://polyhaven.com/a/wooden_crate_01",
    });
    expect(crate?.qualityGate.maxAspectDistortion).toBe(2);
  });

  it("rejects incomplete kits, duplicate registry keys and untraceable CC0 assets", () => {
    const incomplete = structuredClone(assetKitCatalog);
    incomplete.kits[0]!.requiredRoles.push("unsupported-role");
    expect(() => validateAssetKitCatalog(incomplete)).toThrow(/missing role 'unsupported-role'/);

    const duplicate = structuredClone(assetKitCatalog);
    duplicate.assets[1]!.registryKey = duplicate.assets[0]!.registryKey;
    expect(() => validateAssetKitCatalog(duplicate)).toThrow(/Duplicate registry key/);

    const untraceable = structuredClone(assetKitCatalog);
    delete untraceable.assets[0]!.sourceUrl;
    expect(() => validateAssetKitCatalog(untraceable)).toThrow(/CC0 assets require a source URL/);

    const invalidLods = structuredClone(assetKitCatalog);
    const optimized = invalidLods.assets.find((asset) => asset.registryKey === "ornate-street-lamp");
    if (!optimized?.runtimeAsset.lods) throw new Error("Fixture must contain optimized LODs.");
    optimized.runtimeAsset.lods[1]!.minimumDistance = 0;
    expect(() => validateAssetKitCatalog(invalidLods)).toThrow(/LOD distances must increase/);
  });
});
