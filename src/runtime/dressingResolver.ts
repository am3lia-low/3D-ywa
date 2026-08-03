import type { Vector3Tuple } from "../contracts/world";
import { assetKitCatalog, catalogAssetDefinition, type AssetKitCatalogAsset } from "./assetKitCatalog";
import type { AssetDefinition } from "./assetRegistry";
import type { LayoutItem, WorldLayout } from "./layoutEngine";
import type { ScenePresentation } from "./sceneCompiler";

export interface ResolvedDressingInstance {
  dressingId: string;
  locationId: string;
  sourceTag: string;
  decorativeOnly: true;
  catalogId: string;
  registryKey: string;
  asset: AssetDefinition;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  dimensions: Vector3Tuple;
}

type DressingDensity = ScenePresentation["dressing"]["density"];
type DressingWall = "west" | "east";

interface DressingSlot {
  slotId: string;
  searchTags: string[];
  minimumDensity: DressingDensity;
  positionFactor: [number, number];
  dimensions: Vector3Tuple;
  yaw?: number;
  wall?: DressingWall;
}

interface DressingRule {
  anyTags: string[];
  slots: DressingSlot[];
}

const DENSITY_RANK: Readonly<Record<DressingDensity, number>> = {
  sparse: 0,
  moderate: 1,
  rich: 2,
};

/**
 * Presentation-only prop compositions. Slots express visual intent, while the
 * concrete model is still selected from the versioned approved-asset catalog.
 */
const DRESSING_RULES: readonly DressingRule[] = [
  {
    anyTags: ["courtyard-clutter", "coaching-yard-clutter"],
    slots: [
      {
        slotId: "west-barrel",
        searchTags: ["wine", "barrel", "oak"],
        minimumDensity: "sparse",
        positionFactor: [-0.44, 0.28],
        dimensions: [0.82, 1.06, 0.82],
        wall: "west",
      },
      {
        slotId: "west-bench",
        searchTags: ["painted", "wooden", "bench", "seat"],
        minimumDensity: "moderate",
        positionFactor: [-0.46, 0.02],
        dimensions: [1.75, 0.9, 0.65],
        yaw: Math.PI / 2,
        wall: "west",
      },
      {
        slotId: "west-crate",
        searchTags: ["wooden", "crate", "storage"],
        minimumDensity: "moderate",
        positionFactor: [-0.36, 0.31],
        dimensions: [0.84, 0.7, 0.78],
        yaw: 0.22,
      },
      {
        slotId: "east-crate-large",
        searchTags: ["wooden", "crate", "storage"],
        minimumDensity: "rich",
        positionFactor: [0.42, -0.27],
        dimensions: [1.12, 0.84, 0.9],
        yaw: -0.26,
        wall: "east",
      },
      {
        slotId: "east-crate-small",
        searchTags: ["wooden", "crate", "storage"],
        minimumDensity: "rich",
        positionFactor: [0.34, -0.18],
        dimensions: [0.72, 0.58, 0.66],
        yaw: 0.14,
      },
    ],
  },
];

interface OccupiedVolume {
  id: string;
  position: Vector3Tuple;
  dimensions: Vector3Tuple;
}

function tokens(values: readonly string[]): Set<string> {
  return new Set(values.flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)));
}

function chooseAsset(searchTags: readonly string[], styleKitId: string): AssetKitCatalogAsset | undefined {
  const requested = tokens(searchTags);
  return assetKitCatalog.assets
    .filter((asset) => asset.styleKitIds.includes(styleKitId) && Boolean(asset.runtimeAsset.modelUrl))
    .map((asset) => {
      const available = tokens([...asset.roles, ...asset.assetKeys, ...asset.semanticKinds, ...asset.tags]);
      let score = 0;
      for (const token of requested) if (available.has(token)) score += 1;
      return { asset, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.asset.catalogId.localeCompare(right.asset.catalogId))[0]
    ?.asset;
}

function rotatedDimensions(dimensions: Vector3Tuple, yaw: number): Vector3Tuple {
  const sine = Math.abs(Math.sin(yaw));
  const cosine = Math.abs(Math.cos(yaw));
  return [
    dimensions[0] * cosine + dimensions[2] * sine,
    dimensions[1],
    dimensions[0] * sine + dimensions[2] * cosine,
  ];
}

function occupiedByLayoutItem(item: LayoutItem): OccupiedVolume {
  const scaled: Vector3Tuple = [
    item.dimensions[0] * item.scale[0],
    item.dimensions[1] * item.scale[1],
    item.dimensions[2] * item.scale[2],
  ];
  const dimensions = rotatedDimensions(scaled, item.rotation[1]);
  const isPortal = /\b(?:door|gate|portal|hatch)\b/i.test(`${item.entity.kind} ${item.entity.name}`);
  return {
    id: item.entity.id,
    position: item.position,
    dimensions: isPortal
      ? [dimensions[0] + 0.7, dimensions[1], dimensions[2] + 1.8]
      : dimensions,
  };
}

function overlaps(left: OccupiedVolume, right: OccupiedVolume): boolean {
  const spacing = 0.16;
  return (
    Math.abs(left.position[0] - right.position[0]) < (left.dimensions[0] + right.dimensions[0]) / 2 + spacing &&
    Math.abs(left.position[1] - right.position[1]) < (left.dimensions[1] + right.dimensions[1]) / 2 + spacing / 2 &&
    Math.abs(left.position[2] - right.position[2]) < (left.dimensions[2] + right.dimensions[2]) / 2 + spacing
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function candidateOffsets(slot: DressingSlot): Array<[number, number]> {
  const step = 0.48;
  if (slot.wall) {
    return [0, 1, -1, 2, -2, 3, -3, 4, -4].map((distance) => [0, distance * step]);
  }
  return [
    [0, 0],
    [step, 0],
    [-step, 0],
    [0, step],
    [0, -step],
    [step, step],
    [-step, step],
    [step, -step],
    [-step, -step],
    [step * 2, 0],
    [-step * 2, 0],
  ];
}

function placeSlot(
  slot: DressingSlot,
  bounds: Vector3Tuple,
  occupied: readonly OccupiedVolume[],
): { position: Vector3Tuple; footprint: Vector3Tuple } | undefined {
  const yaw = slot.yaw ?? 0;
  const footprint = rotatedDimensions(slot.dimensions, yaw);
  const halfX = Math.max(0, bounds[0] / 2 - footprint[0] / 2 - 0.18);
  const halfZ = Math.max(0, bounds[2] / 2 - footprint[2] / 2 - 0.18);
  const desiredX = slot.wall === "west"
    ? -halfX
    : slot.wall === "east"
      ? halfX
      : bounds[0] * slot.positionFactor[0];
  const desiredZ = bounds[2] * slot.positionFactor[1];

  for (const [offsetX, offsetZ] of candidateOffsets(slot)) {
    const position: Vector3Tuple = [
      clamp(desiredX + offsetX, -halfX, halfX),
      slot.dimensions[1] / 2,
      clamp(desiredZ + offsetZ, -halfZ, halfZ),
    ];
    const candidate: OccupiedVolume = { id: slot.slotId, position, dimensions: footprint };
    if (!occupied.some((other) => overlaps(candidate, other))) return { position, footprint };
  }
  return undefined;
}

/** Resolves decorative tags without minting canonical narrative identities. */
export function resolveDressingInstances(
  layout: WorldLayout,
  presentation: ScenePresentation,
  styleKitId: string,
): ResolvedDressingInstance[] {
  const selectedTags = new Set(presentation.location.dressingTags);
  const occupied: OccupiedVolume[] = layout.items.map(occupiedByLayoutItem);
  const instances: ResolvedDressingInstance[] = [];

  for (const rule of DRESSING_RULES) {
    const sourceTag = rule.anyTags.find((tag) => selectedTags.has(tag));
    if (!sourceTag) continue;
    for (const slot of rule.slots) {
      if (DENSITY_RANK[presentation.dressing.density] < DENSITY_RANK[slot.minimumDensity]) continue;
      const catalogAsset = chooseAsset(slot.searchTags, styleKitId);
      if (!catalogAsset) continue;
      const placed = placeSlot(slot, layout.location.bounds ?? [12, 4.5, 10], occupied);
      if (!placed) continue;
      const dressingId = `${layout.location.id}:dressing:${sourceTag}:${slot.slotId}`;
      occupied.push({ id: dressingId, position: placed.position, dimensions: placed.footprint });
      instances.push({
        dressingId,
        locationId: layout.location.id,
        sourceTag,
        decorativeOnly: true,
        catalogId: catalogAsset.catalogId,
        registryKey: catalogAsset.registryKey,
        asset: catalogAssetDefinition(catalogAsset),
        position: placed.position,
        rotation: [0, slot.yaw ?? 0, 0],
        dimensions: slot.dimensions,
      });
    }
  }
  return instances;
}
