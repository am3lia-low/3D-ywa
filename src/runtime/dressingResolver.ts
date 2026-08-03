import type { Vector3Tuple } from "../contracts/world";
import { assetKitCatalog, catalogAssetDefinition, type AssetKitCatalogAsset } from "./assetKitCatalog";
import type { AssetDefinition } from "./assetRegistry";
import type { LayoutItem, WorldLayout } from "./layoutEngine";
import type { ScenePresentation } from "./sceneCompiler";

interface ResolvedDressingCommon {
  dressingId: string;
  locationId: string;
  sourceTag: string;
  decorativeOnly: true;
  density: "sparse" | "moderate" | "rich";
  placementStatus: "preferred" | "rerouted";
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  dimensions: Vector3Tuple;
}

export interface ResolvedAssetDressingInstance extends ResolvedDressingCommon {
  renderKind: "asset";
  catalogId: string;
  registryKey: string;
  asset: AssetDefinition;
}

export type DressingModuleKey =
  | "attic-library"
  | "travel-chest"
  | "botanical-planter"
  | "climbing-vine";

export interface ResolvedModuleDressingInstance extends ResolvedDressingCommon {
  renderKind: "module";
  moduleKey: DressingModuleKey;
}

export type ResolvedDressingInstance =
  | ResolvedAssetDressingInstance
  | ResolvedModuleDressingInstance;

type DressingDensity = ScenePresentation["dressing"]["density"];
type DressingWall = "north" | "south" | "west" | "east";

interface DressingSlotCommon {
  slotId: string;
  minimumDensity: DressingDensity;
  positionFactor: [number, number];
  dimensions: Vector3Tuple;
  yaw?: number;
  wall?: DressingWall;
  verticalOffset?: number;
}

interface AssetDressingSlot extends DressingSlotCommon {
  renderKind: "asset";
  searchTags: string[];
}

interface ModuleDressingSlot extends DressingSlotCommon {
  renderKind: "module";
  moduleKey: DressingModuleKey;
}

type DressingSlot = AssetDressingSlot | ModuleDressingSlot;

interface DressingRule {
  anyTags: string[];
  archetypes?: string[];
  slots: DressingSlot[];
}

const DENSITY_RANK: Readonly<Record<DressingDensity, number>> = {
  sparse: 0,
  moderate: 1,
  rich: 2,
};

/**
 * Presentation-only prop compositions. Slots express visual intent; physical
 * props resolve through the approved catalog while adaptive visuals use a
 * bounded renderer module whose placement still comes from this recipe.
 */
const DRESSING_RULES: readonly DressingRule[] = [
  {
    anyTags: ["books"],
    archetypes: ["timber-attic"],
    slots: [{
      renderKind: "module",
      moduleKey: "attic-library",
      slotId: "west-library",
      minimumDensity: "sparse",
      positionFactor: [-0.47, -0.035],
      dimensions: [3.55, 2.75, 0.72],
      yaw: Math.PI / 2,
      wall: "west",
    }],
  },
  {
    anyTags: ["storage-crates"],
    archetypes: ["timber-attic"],
    slots: [
      {
        renderKind: "asset",
        searchTags: ["wooden", "crate", "storage"],
        slotId: "west-crate-large",
        minimumDensity: "sparse",
        positionFactor: [-0.38, 0.3],
        dimensions: [1.38, 0.84, 1.08],
        yaw: -0.08,
      },
      {
        renderKind: "asset",
        searchTags: ["wooden", "crate", "storage"],
        slotId: "west-crate-small",
        minimumDensity: "rich",
        positionFactor: [-0.29, 0.31],
        dimensions: [0.92, 0.62, 0.76],
        yaw: 0.18,
      },
    ],
  },
  {
    anyTags: ["travel-chest"],
    archetypes: ["timber-attic"],
    slots: [{
      renderKind: "module",
      moduleKey: "travel-chest",
      slotId: "east-travel-chest",
      minimumDensity: "moderate",
      positionFactor: [0.37, 0.27],
      dimensions: [2.05, 0.96, 1.12],
      yaw: -0.08,
    }],
  },
  {
    anyTags: ["planters", "ceramic-pots"],
    archetypes: ["moonlit-conservatory"],
    slots: [
      {
        renderKind: "module", moduleKey: "botanical-planter", slotId: "northwest-planter",
        minimumDensity: "sparse", positionFactor: [-0.39, -0.32], dimensions: [0.68, 1.17, 0.68],
      },
      {
        renderKind: "module", moduleKey: "botanical-planter", slotId: "west-planter",
        minimumDensity: "sparse", positionFactor: [-0.4, 0], dimensions: [0.8, 1.38, 0.8],
      },
      {
        renderKind: "module", moduleKey: "botanical-planter", slotId: "southwest-planter",
        minimumDensity: "moderate", positionFactor: [-0.38, 0.3], dimensions: [0.92, 1.59, 0.92],
      },
      {
        renderKind: "module", moduleKey: "botanical-planter", slotId: "northeast-planter",
        minimumDensity: "rich", positionFactor: [0.34, -0.37], dimensions: [0.68, 1.17, 0.68],
      },
      {
        renderKind: "module", moduleKey: "botanical-planter", slotId: "southeast-planter",
        minimumDensity: "rich", positionFactor: [0.4, 0.32], dimensions: [0.8, 1.38, 0.8],
      },
    ],
  },
  {
    anyTags: ["climbing-vines"],
    archetypes: ["moonlit-conservatory"],
    slots: [-1 / 3, -1 / 6, 0, 1 / 6, 1 / 3].map((xFactor, index) => ({
      renderKind: "module" as const,
      moduleKey: "climbing-vine" as const,
      slotId: `north-vine-${index + 1}`,
      minimumDensity: index < 2 ? "sparse" as const : index < 4 ? "moderate" as const : "rich" as const,
      positionFactor: [xFactor, -0.47] as [number, number],
      dimensions: [0.5, 2.5, 0.35] as Vector3Tuple,
      wall: "north" as const,
      verticalOffset: 0.72,
    })),
  },
  {
    anyTags: ["courtyard-clutter", "coaching-yard-clutter"],
    slots: [
      {
        renderKind: "asset", searchTags: ["wine", "barrel", "oak"], slotId: "west-barrel",
        minimumDensity: "sparse", positionFactor: [-0.44, 0.28], dimensions: [0.82, 1.06, 0.82], wall: "west",
      },
      {
        renderKind: "asset", searchTags: ["painted", "wooden", "bench", "seat"], slotId: "west-bench",
        minimumDensity: "moderate", positionFactor: [-0.46, 0.02], dimensions: [1.75, 0.9, 0.65],
        yaw: Math.PI / 2, wall: "west",
      },
      {
        renderKind: "asset", searchTags: ["wooden", "crate", "storage"], slotId: "west-crate",
        minimumDensity: "moderate", positionFactor: [-0.36, 0.31], dimensions: [0.84, 0.7, 0.78], yaw: 0.22,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "crate", "storage"], slotId: "east-crate-large",
        minimumDensity: "rich", positionFactor: [0.42, -0.27], dimensions: [1.12, 0.84, 0.9],
        yaw: -0.26, wall: "east",
      },
      {
        renderKind: "asset", searchTags: ["wooden", "crate", "storage"], slotId: "east-crate-small",
        minimumDensity: "rich", positionFactor: [0.34, -0.18], dimensions: [0.72, 0.58, 0.66], yaw: 0.14,
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
  const distances = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8];
  if (slot.wall === "west" || slot.wall === "east") {
    return distances.map((distance) => [0, distance * step]);
  }
  if (slot.wall === "north" || slot.wall === "south") {
    return distances.map((distance) => [distance * step, 0]);
  }
  const offsets: Array<[number, number]> = [[0, 0]];
  for (let ring = 1; ring <= 7; ring += 1) {
    for (let x = -ring; x <= ring; x += 1) {
      for (let z = -ring; z <= ring; z += 1) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== ring) continue;
        offsets.push([x * step, z * step]);
      }
    }
  }
  return offsets;
}

function placeSlot(
  slot: DressingSlot,
  bounds: Vector3Tuple,
  occupied: readonly OccupiedVolume[],
): { position: Vector3Tuple; footprint: Vector3Tuple; placementStatus: "preferred" | "rerouted" } | undefined {
  const yaw = slot.yaw ?? 0;
  const footprint = rotatedDimensions(slot.dimensions, yaw);
  const halfX = Math.max(0, bounds[0] / 2 - footprint[0] / 2 - 0.18);
  const halfZ = Math.max(0, bounds[2] / 2 - footprint[2] / 2 - 0.18);
  const desiredX = slot.wall === "west"
    ? -halfX
    : slot.wall === "east"
      ? halfX
      : bounds[0] * slot.positionFactor[0];
  const desiredZ = slot.wall === "north"
    ? -halfZ
    : slot.wall === "south"
      ? halfZ
      : bounds[2] * slot.positionFactor[1];

  for (const [index, [offsetX, offsetZ]] of candidateOffsets(slot).entries()) {
    const position: Vector3Tuple = [
      clamp(desiredX + offsetX, -halfX, halfX),
      slot.dimensions[1] / 2 + (slot.verticalOffset ?? 0),
      clamp(desiredZ + offsetZ, -halfZ, halfZ),
    ];
    const candidate: OccupiedVolume = { id: slot.slotId, position, dimensions: footprint };
    if (!occupied.some((other) => overlaps(candidate, other))) {
      return { position, footprint, placementStatus: index === 0 ? "preferred" : "rerouted" };
    }
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
    if (rule.archetypes && !rule.archetypes.includes(presentation.location.archetype)) continue;
    const sourceTag = rule.anyTags.find((tag) => selectedTags.has(tag));
    if (!sourceTag) continue;
    for (const slot of rule.slots) {
      if (DENSITY_RANK[presentation.dressing.density] < DENSITY_RANK[slot.minimumDensity]) continue;
      const catalogAsset = slot.renderKind === "asset"
        ? chooseAsset(slot.searchTags, styleKitId)
        : undefined;
      if (slot.renderKind === "asset" && !catalogAsset) continue;
      const placed = placeSlot(slot, layout.location.bounds ?? [12, 4.5, 10], occupied);
      if (!placed) continue;
      const dressingId = `${layout.location.id}:dressing:${sourceTag}:${slot.slotId}`;
      occupied.push({ id: dressingId, position: placed.position, dimensions: placed.footprint });
      const common: ResolvedDressingCommon = {
        dressingId,
        locationId: layout.location.id,
        sourceTag,
        decorativeOnly: true,
        density: presentation.dressing.density,
        placementStatus: placed.placementStatus,
        position: placed.position,
        rotation: [0, slot.yaw ?? 0, 0],
        dimensions: slot.dimensions,
      };
      if (slot.renderKind === "module") {
        instances.push({ ...common, renderKind: "module", moduleKey: slot.moduleKey });
        continue;
      }
      instances.push({
        ...common,
        renderKind: "asset",
        catalogId: catalogAsset!.catalogId,
        registryKey: catalogAsset!.registryKey,
        asset: catalogAssetDefinition(catalogAsset!),
      });
    }
  }
  return instances;
}
