import type { Entity, Vector3Tuple } from "../contracts/world";

export type PrimitiveGeometry = "box" | "cylinder" | "sphere";

export interface AssetDefinition {
  key: string;
  geometry: PrimitiveGeometry;
  dimensions: Vector3Tuple;
  color: string;
  roughness?: number;
  metalness?: number;
}

export type AssetRegistry = Readonly<Record<string, AssetDefinition>>;

const fallback: AssetDefinition = {
  key: "fallback",
  geometry: "box",
  dimensions: [0.7, 0.7, 0.7],
  color: "#b8a995",
  roughness: 0.85,
};

export const defaultAssetRegistry: AssetRegistry = {
  desk: {
    key: "desk",
    geometry: "box",
    dimensions: [2.4, 1.2, 1.1],
    color: "#6f472c",
    roughness: 0.9,
  },
  chair: {
    key: "chair",
    geometry: "box",
    dimensions: [0.85, 1.1, 0.85],
    color: "#8a5b38",
    roughness: 0.88,
  },
  fireplace: {
    key: "fireplace",
    geometry: "box",
    dimensions: [2.2, 2.2, 0.65],
    color: "#776d65",
    roughness: 1,
  },
  rug: {
    key: "rug",
    geometry: "box",
    dimensions: [3.8, 0.08, 2.6],
    color: "#874b48",
    roughness: 1,
  },
  lantern: {
    key: "lantern",
    geometry: "cylinder",
    dimensions: [0.45, 0.8, 0.45],
    color: "#c98f34",
    roughness: 0.45,
    metalness: 0.65,
  },
  "hidden-door": {
    key: "hidden-door",
    geometry: "box",
    dimensions: [1.8, 2.9, 0.25],
    color: "#4e3c31",
    roughness: 0.95,
  },
};

export function resolveAsset(
  entity: Entity,
  registry: AssetRegistry = defaultAssetRegistry,
): AssetDefinition {
  const requested = entity.assetKey ?? entity.kind;
  const registered = registry[requested];

  if (registered) {
    return entity.dimensions
      ? { ...registered, dimensions: entity.dimensions }
      : registered;
  }

  return {
    ...fallback,
    key: `fallback:${requested}`,
    dimensions: entity.dimensions ?? fallback.dimensions,
  };
}

