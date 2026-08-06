import type { Vector3Tuple } from "../contracts/world";
import { assetKitCatalog, catalogAssetDefinition, type AssetKitCatalogAsset } from "./assetKitCatalog";
import type { AssetDefinition } from "./assetRegistry";
import { supportSurfaceWorldY, type LayoutItem, type WorldLayout } from "./layoutEngine";
import type { ScenePresentation } from "./sceneCompiler";
import { WALL_COMPOSITION } from "./wallComposition";

interface ResolvedDressingCommon {
  dressingId: string;
  locationId: string;
  sourceTag: string;
  decorativeOnly: true;
  density: "sparse" | "moderate" | "rich";
  placementStatus: "preferred" | "rerouted";
  placementRegion: "interior" | "approach" | "woodland";
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  dimensions: Vector3Tuple;
  wall?: DressingWall;
  placementAnchor: DressingPlacementAnchor;
  supportId?: string;
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
export type DressingWall = "north" | "south" | "west" | "east";
export type DressingPlacementAnchor = "floor" | "surface" | "wall" | "ceiling";

interface DressingSlotCommon {
  slotId: string;
  minimumDensity: DressingDensity;
  positionFactor: [number, number];
  dimensions: Vector3Tuple;
  yaw?: number;
  wall?: DressingWall;
  verticalOffset?: number;
  placementRegion?: "interior" | "approach" | "woodland";
  placementAnchor?: DressingPlacementAnchor;
  supportSearchTags?: string[];
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
  excludeTags?: string[];
  excludeArchetypes?: string[];
  archetypes?: string[];
  requiresOpenAir?: boolean;
  requiresArchitecture?: keyof ScenePresentation["architecture"];
  slots: DressingSlot[];
}

const DENSITY_RANK: Readonly<Record<DressingDensity, number>> = {
  sparse: 0,
  moderate: 1,
  rich: 2,
};

type ApproachSlotSpec = readonly [
  minimumDensity: DressingDensity,
  xFactor: number,
  zFactor: number,
  width: number,
  height: number,
  depth: number,
  yaw: number,
];

function approachAssetSlots(
  prefix: string,
  searchTags: string[],
  specs: readonly ApproachSlotSpec[],
): AssetDressingSlot[] {
  return specs.map(([minimumDensity, x, z, width, height, depth, yaw], index) => ({
    renderKind: "asset",
    searchTags,
    slotId: `${prefix}-${index + 1}`,
    minimumDensity,
    positionFactor: [x, z],
    dimensions: [width, height, depth],
    yaw,
    placementRegion: "approach",
  }));
}

function woodlandAssetSlots(
  prefix: string,
  searchTags: string[],
  specs: readonly ApproachSlotSpec[],
): AssetDressingSlot[] {
  return approachAssetSlots(prefix, searchTags, specs).map((slot) => ({
    ...slot,
    placementRegion: "woodland",
  }));
}

/**
 * Presentation-only prop compositions. Slots express visual intent; physical
 * props resolve through the approved catalog while adaptive visuals use a
 * bounded renderer module whose placement still comes from this recipe.
 */
const DRESSING_RULES: readonly DressingRule[] = [
  {
    anyTags: ["schoolroom-furnishings", "classroom-furnishings"],
    slots: [
      {
        renderKind: "asset", searchTags: ["wooden", "chair", "antique", "school"], slotId: "schoolroom-chair-west",
        minimumDensity: "sparse", positionFactor: [-0.16, 0.14], dimensions: [0.72, 1.1, 0.72], yaw: 2.72,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "chair", "antique", "school"], slotId: "schoolroom-chair-east",
        minimumDensity: "moderate", positionFactor: [0.16, 0.14], dimensions: [0.72, 1.1, 0.72], yaw: -2.72,
      },
      {
        renderKind: "asset", searchTags: ["leather", "books", "antique", "lesson"], slotId: "schoolroom-copybooks",
        minimumDensity: "moderate", positionFactor: [0, 0], dimensions: [0.54, 0.18, 0.24],
        placementAnchor: "surface", supportSearchTags: ["schoolroom", "table", "desk"], yaw: -0.08,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "candlestick", "antique", "school"], slotId: "schoolroom-candlestick",
        minimumDensity: "rich", positionFactor: [0, 0], dimensions: [0.18, 0.52, 0.18],
        placementAnchor: "surface", supportSearchTags: ["schoolroom", "table", "desk"], yaw: 0.12,
      },
    ],
  },
  {
    // Estate scenes have a dedicated authored composition in WorldViewer.
    // This rule is the reusable equivalent for every other grounded interior.
    anyTags: ["period-interior"],
    excludeTags: ["estate-furnishings", "schoolroom-furnishings"],
    slots: [
      {
        renderKind: "asset", searchTags: ["classic", "console", "victorian", "ornate", "hall"], slotId: "east-side-table",
        minimumDensity: "sparse", positionFactor: [0.4, 0.08], dimensions: [1.55, 0.95, 0.59], yaw: -0.08,
      },
      {
        renderKind: "asset", searchTags: ["classic", "console", "victorian", "ornate", "hall"], slotId: "south-console-table",
        minimumDensity: "moderate", positionFactor: [0.27, 0.39], dimensions: [1.55, 0.95, 0.59], yaw: Math.PI,
      },
      {
        renderKind: "asset", searchTags: ["painted", "archive", "cabinet", "worn"], slotId: "southwest-display-cabinet",
        minimumDensity: "rich", positionFactor: [-0.42, 0.3], dimensions: [0.85, 2.2, 0.62], yaw: 0.18,
      },
      {
        renderKind: "asset", searchTags: ["antique", "ceramic", "vase", "surface"], slotId: "period-console-vase",
        minimumDensity: "moderate", positionFactor: [0, 0], dimensions: [0.27, 0.4, 0.27],
        placementAnchor: "surface", supportSearchTags: ["console", "side", "table", "accent"], yaw: -0.08,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "candlestick", "period", "surface"], slotId: "period-console-candlestick",
        minimumDensity: "rich", positionFactor: [0, 0], dimensions: [0.18, 0.52, 0.18],
        placementAnchor: "surface", supportSearchTags: ["console", "side", "table", "accent"], yaw: 0.1,
      },
    ],
  },
  {
    anyTags: ["tavern-interior", "inn-common-room", "alehouse"],
    slots: [
      {
        renderKind: "asset", searchTags: ["wooden", "table", "sturdy", "rustic"], slotId: "tavern-table-west",
        minimumDensity: "sparse", positionFactor: [-0.22, -0.08], dimensions: [2.1, 0.9, 1.18], yaw: 0.05,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "table", "sturdy", "rustic"], slotId: "tavern-table-east",
        minimumDensity: "rich", positionFactor: [0.23, 0.18], dimensions: [1.85, 0.9, 1.08], yaw: -0.08,
      },
      {
        renderKind: "asset", searchTags: ["painted", "wooden", "bench", "seat"], slotId: "tavern-bench-north",
        minimumDensity: "moderate", positionFactor: [-0.22, -0.42], dimensions: [1.75, 0.9, 0.65], wall: "north",
      },
      {
        renderKind: "asset", searchTags: ["wine", "barrel", "oak", "storage"], slotId: "tavern-barrel-west",
        minimumDensity: "sparse", positionFactor: [-0.44, 0.3], dimensions: [0.82, 1.06, 0.82], wall: "west",
      },
      {
        renderKind: "asset", searchTags: ["ceramic", "jug", "vessel", "rustic"], slotId: "tavern-table-jug",
        minimumDensity: "moderate", positionFactor: [0, 0], dimensions: [0.3, 0.42, 0.3],
        placementAnchor: "surface", supportSearchTags: ["tavern", "wooden", "table"], yaw: 0.12,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "candlestick", "warm", "table"], slotId: "tavern-table-candle",
        minimumDensity: "rich", positionFactor: [0, 0], dimensions: [0.18, 0.52, 0.18],
        placementAnchor: "surface", supportSearchTags: ["tavern", "wooden", "table"], yaw: -0.08,
      },
    ],
  },
  {
    anyTags: ["nautical-interior", "ship-cabin", "signal-room"],
    slots: [
      {
        renderKind: "asset", searchTags: ["painted", "wooden", "bench", "seat"], slotId: "nautical-bench-west",
        minimumDensity: "sparse", positionFactor: [-0.46, 0.06], dimensions: [1.75, 0.9, 0.65],
        wall: "west", yaw: Math.PI / 2,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "crate", "storage"], slotId: "nautical-crate-east",
        minimumDensity: "moderate", positionFactor: [0.42, 0.27], dimensions: [0.89, 0.61, 0.66],
        wall: "east", yaw: -0.12,
      },
      {
        renderKind: "asset", searchTags: ["wine", "barrel", "oak", "storage"], slotId: "nautical-barrel-south",
        minimumDensity: "rich", positionFactor: [0.34, 0.4], dimensions: [0.82, 1.06, 0.82],
        wall: "south", yaw: 0.15,
      },
      {
        renderKind: "asset", searchTags: ["brass", "lantern", "practical", "light"], slotId: "nautical-work-lantern",
        minimumDensity: "sparse", positionFactor: [0, 0], dimensions: [0.34, 0.66, 0.34],
        placementAnchor: "surface", supportSearchTags: ["desk", "chart", "table", "workbench"],
      },
    ],
  },
  {
    anyTags: ["bedroom-interior", "bedchamber"],
    slots: [
      {
        renderKind: "asset", searchTags: ["side", "table", "bedside", "accent"], slotId: "bedroom-side-table-west",
        minimumDensity: "sparse", positionFactor: [-0.26, -0.25], dimensions: [0.68, 0.82, 0.58], yaw: 0.04,
      },
      {
        renderKind: "asset", searchTags: ["side", "table", "bedside", "accent"], slotId: "bedroom-side-table-east",
        minimumDensity: "rich", positionFactor: [0.26, -0.25], dimensions: [0.68, 0.82, 0.58], yaw: -0.04,
      },
      {
        renderKind: "asset", searchTags: ["vintage", "cabinet", "storage", "wardrobe"], slotId: "bedroom-storage-cabinet",
        minimumDensity: "moderate", positionFactor: [0.43, 0.2], dimensions: [1.05, 1.12, 0.58],
        wall: "east", yaw: -Math.PI / 2,
      },
      {
        renderKind: "asset", searchTags: ["table", "lamp", "reading", "warm"], slotId: "bedroom-table-lamp",
        minimumDensity: "sparse", positionFactor: [0, 0], dimensions: [0.27, 0.56, 0.31],
        placementAnchor: "surface", supportSearchTags: ["side", "table", "bedside"],
      },
    ],
  },
  {
    anyTags: ["writing-room", "writing-desk", "study", "office"],
    excludeTags: ["estate-furnishings"],
    slots: [
      {
        renderKind: "asset", searchTags: ["aged", "leather", "notebook", "writing"], slotId: "writing-surface-notebook",
        minimumDensity: "sparse", positionFactor: [0, 0], dimensions: [0.28, 0.045, 0.36],
        placementAnchor: "surface", supportSearchTags: ["desk", "writing", "table", "console"], yaw: -0.12,
      },
      {
        renderKind: "asset", searchTags: ["antique", "oil", "lamp", "reading"], slotId: "writing-surface-lamp",
        minimumDensity: "moderate", positionFactor: [0, 0], dimensions: [0.28, 0.82, 0.28],
        placementAnchor: "surface", supportSearchTags: ["desk", "writing", "table", "console"], yaw: 0.18,
      },
      {
        renderKind: "asset", searchTags: ["leather", "books", "library", "reading"], slotId: "writing-surface-books",
        minimumDensity: "rich", positionFactor: [0, 0], dimensions: [0.6, 0.25, 0.18],
        placementAnchor: "surface", supportSearchTags: ["desk", "writing", "table", "console"], yaw: 0.08,
      },
      {
        renderKind: "asset", searchTags: ["potted", "plant", "interior", "corner"], slotId: "interior-corner-plant",
        minimumDensity: "rich", positionFactor: [0.38, 0.3], dimensions: [0.9, 1.4, 0.9], yaw: -0.22,
      },
      {
        renderKind: "asset", searchTags: ["ornate", "painting", "gilt", "gallery"], slotId: "north-wall-art",
        minimumDensity: "moderate", positionFactor: [0.18, -0.47], dimensions: [0.96, 0.75, 0.035],
        placementAnchor: "wall", wall: "north", verticalOffset: 1.55,
      },
      {
        renderKind: "asset", searchTags: ["ornate", "mirror", "gilded", "antique"], slotId: "south-wall-mirror",
        minimumDensity: "rich", positionFactor: [-0.22, 0.47], dimensions: [0.62, 1.08, 0.035],
        placementAnchor: "wall", wall: "south", verticalOffset: 1.35, yaw: Math.PI,
      },
    ],
  },
  {
    anyTags: ["wall-gallery", "picture-wall", "portrait-wall", "framed-art", "paintings"],
    excludeTags: ["estate-furnishings"],
    slots: [
      {
        renderKind: "asset", searchTags: ["ornate", "landscape", "painting", "gilt"], slotId: "gallery-north-landscape",
        minimumDensity: "sparse", positionFactor: [0.18, -0.47], dimensions: [0.96, 0.75, 0.035],
        placementAnchor: "wall", wall: "north", verticalOffset: 1.65,
      },
      {
        renderKind: "asset", searchTags: ["ornate", "riverscape", "painting", "gallery"], slotId: "gallery-south-riverscape",
        minimumDensity: "moderate", positionFactor: [-0.2, 0.47], dimensions: [0.82, 0.64, 0.035],
        placementAnchor: "wall", wall: "south", verticalOffset: 1.62, yaw: Math.PI,
      },
      {
        renderKind: "asset", searchTags: ["ornate", "mirror", "gilded", "antique"], slotId: "gallery-east-mirror",
        minimumDensity: "rich", positionFactor: [0.47, 0.2], dimensions: [0.62, 1.08, 0.035],
        placementAnchor: "wall", wall: "east", verticalOffset: 1.35, yaw: -Math.PI / 2,
      },
    ],
  },
  {
    anyTags: ["reading-nook", "reading-room", "library", "books"],
    excludeTags: ["estate-furnishings"],
    excludeArchetypes: ["timber-attic", "archive-vault"],
    slots: [
      {
        renderKind: "asset", searchTags: ["rocking", "chair", "reading", "vintage"], slotId: "reading-rocker",
        minimumDensity: "moderate", positionFactor: [-0.32, 0.27], dimensions: [0.78, 1.12, 1.02], yaw: 2.55,
      },
      {
        renderKind: "asset", searchTags: ["side", "table", "accent", "period"], slotId: "reading-side-table",
        minimumDensity: "moderate", positionFactor: [-0.22, 0.28], dimensions: [0.68, 0.82, 0.58], yaw: 0.08,
      },
      {
        renderKind: "asset", searchTags: ["table", "lamp", "reading", "warm"], slotId: "reading-table-lamp",
        minimumDensity: "moderate", positionFactor: [0, 0], dimensions: [0.27, 0.56, 0.31],
        placementAnchor: "surface", supportSearchTags: ["side", "table", "accent"],
      },
      {
        renderKind: "asset", searchTags: ["wicker", "basket", "reading", "woven"], slotId: "reading-basket",
        minimumDensity: "rich", positionFactor: [-0.4, 0.33], dimensions: [0.5, 0.42, 0.45], yaw: -0.22,
      },
    ],
  },
  {
    anyTags: ["parlor", "parlour", "drawing-room", "salon", "sitting-room", "conversation-area", "lounge"],
    excludeTags: ["estate-furnishings"],
    slots: [
      {
        renderKind: "asset", searchTags: ["victorian", "upholstered", "sofa", "parlor"], slotId: "parlor-sofa",
        minimumDensity: "sparse", positionFactor: [-0.23, 0.27], dimensions: [2.73, 1.12, 0.93], yaw: 0.05,
      },
      {
        renderKind: "asset", searchTags: ["victorian", "upholstered", "armchair", "parlor"], slotId: "parlor-chair",
        minimumDensity: "moderate", positionFactor: [0.22, 0.18], dimensions: [1.05, 1.32, 0.95], yaw: -2.35,
      },
      {
        renderKind: "asset", searchTags: ["gothic", "coffee", "table", "parlor"], slotId: "parlor-coffee-table",
        minimumDensity: "moderate", positionFactor: [0, 0.2], dimensions: [1.44, 0.56, 1.44],
      },
      {
        renderKind: "asset", searchTags: ["marble", "chess", "game", "tabletop"], slotId: "parlor-chess-set",
        minimumDensity: "rich", positionFactor: [0, 0], dimensions: [0.58, 0.18, 0.58],
        placementAnchor: "surface", supportSearchTags: ["coffee", "table", "parlor"], yaw: 0.08,
      },
    ],
  },
  {
    anyTags: ["mantel-display", "mantel", "fireplace", "hearth"],
    excludeTags: ["estate-furnishings"],
    slots: [
      {
        renderKind: "asset", searchTags: ["mantel", "clock", "antique", "brass"], slotId: "mantel-clock",
        minimumDensity: "sparse", positionFactor: [0, 0], dimensions: [0.5, 0.314, 0.184],
        placementAnchor: "surface", supportSearchTags: ["fireplace", "hearth", "mantel"],
      },
      {
        renderKind: "asset", searchTags: ["horse", "figurine", "porcelain", "mantel"], slotId: "mantel-figurine",
        minimumDensity: "rich", positionFactor: [0, 0], dimensions: [0.34, 0.46, 0.2],
        placementAnchor: "surface", supportSearchTags: ["fireplace", "hearth", "mantel"], yaw: 0.16,
      },
    ],
  },
  {
    anyTags: ["interior-rugs"],
    slots: [{
      renderKind: "asset", searchTags: ["rug", "red", "woven"], slotId: "central-room-rug",
      minimumDensity: "sparse", positionFactor: [0, 0.04], dimensions: [5.6, 0.12, 3.83], yaw: 0,
    }],
  },
  {
    anyTags: ["interior-lighting"],
    excludeTags: ["estate-furnishings", "schoolroom-furnishings", "tavern-interior", "nautical-interior", "bedroom-interior"],
    slots: [
      {
        renderKind: "asset", searchTags: ["storybook", "floor", "lamp"], slotId: "west-floor-lamp",
        minimumDensity: "sparse", positionFactor: [-0.34, -0.25], dimensions: [0.32, 1.8, 0.37], yaw: 0.12,
      },
      {
        renderKind: "asset", searchTags: ["storybook", "floor", "lamp"], slotId: "east-floor-lamp",
        minimumDensity: "rich", positionFactor: [0.34, 0.23], dimensions: [0.32, 1.8, 0.37], yaw: -0.18,
      },
    ],
  },
  {
    anyTags: ["archive-clutter"],
    slots: [
      {
        renderKind: "asset", searchTags: ["painted", "archive", "cabinet", "worn"], slotId: "west-archive-cabinet",
        minimumDensity: "sparse", positionFactor: [-0.47, 0.06], dimensions: [0.85, 2.2, 0.62],
        yaw: Math.PI / 2, wall: "west",
      },
      {
        renderKind: "asset", searchTags: ["worn", "wooden", "bookshelf", "archive"], slotId: "east-archive-cabinet",
        minimumDensity: "rich", positionFactor: [0.47, -0.12], dimensions: [1.46, 2.2, 0.62],
        yaw: -Math.PI / 2, wall: "east",
      },
      {
        renderKind: "asset", searchTags: ["desk", "writing", "table", "oak"], slotId: "archive-reading-table",
        minimumDensity: "sparse", positionFactor: [0, 0.08], dimensions: [2.4, 1.2, 1.1], yaw: 0.08,
      },
      {
        renderKind: "asset", searchTags: ["chair", "seat", "wood", "antique"], slotId: "archive-reading-chair",
        minimumDensity: "moderate", positionFactor: [0, 0.18], dimensions: [0.95, 1.55, 0.95], yaw: Math.PI,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "crate", "storage"], slotId: "archive-crate",
        minimumDensity: "rich", positionFactor: [-0.34, 0.34], dimensions: [1.05, 0.72, 0.78], yaw: 0.18,
      },
    ],
  },
  {
    anyTags: ["books"],
    archetypes: ["timber-attic"],
    slots: [{
      renderKind: "module",
      moduleKey: "attic-library",
      slotId: "west-library",
      minimumDensity: "sparse",
      positionFactor: [-0.47, -0.035],
      dimensions: [2.8, 3, 0.68],
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
        minimumDensity: "moderate", positionFactor: [-0.36, 0.31], dimensions: [0.89, 0.61, 0.66], yaw: 0.22,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "crate", "storage"], slotId: "east-crate-large",
        minimumDensity: "rich", positionFactor: [0.42, -0.27], dimensions: [1.12, 0.84, 0.9],
        yaw: -0.26, wall: "east",
      },
      {
        renderKind: "asset", searchTags: ["wooden", "crate", "storage"], slotId: "east-crate-small",
        minimumDensity: "rich", positionFactor: [0.34, -0.18], dimensions: [0.74, 0.51, 0.55], yaw: 0.14,
      },
    ],
  },
  {
    anyTags: ["urban-clutter"],
    requiresOpenAir: true,
    requiresArchitecture: "urbanStreet",
    slots: [
      {
        renderKind: "asset", searchTags: ["wine", "barrel", "oak"], slotId: "west-urban-barrel",
        minimumDensity: "moderate", positionFactor: [-0.31, -0.3], dimensions: [0.82, 1.06, 0.82], yaw: 0.08,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "crate", "storage"], slotId: "west-urban-crate",
        minimumDensity: "rich", positionFactor: [-0.31, 0.27], dimensions: [0.89, 0.61, 0.66], yaw: 0.22,
      },
      {
        renderKind: "asset", searchTags: ["wooden", "crate", "storage"], slotId: "east-urban-crate",
        minimumDensity: "rich", positionFactor: [0.305, -0.2], dimensions: [1.12, 0.84, 0.9], yaw: -0.2,
      },
    ],
  },
  {
    anyTags: ["street-lamps", "market clutter"],
    requiresOpenAir: true,
    slots: [
      {
        renderKind: "asset", searchTags: ["ornate", "street", "lamp", "urban"], slotId: "west-street-lamp-near",
        minimumDensity: "sparse", positionFactor: [-0.29, -0.24], dimensions: [0.5, 2.85, 0.3], yaw: 0.15,
      },
      {
        renderKind: "asset", searchTags: ["ornate", "street", "lamp", "urban"], slotId: "east-street-lamp-near",
        minimumDensity: "moderate", positionFactor: [0.29, -0.08], dimensions: [0.5, 2.85, 0.3], yaw: -0.18,
      },
      {
        renderKind: "asset", searchTags: ["ornate", "street", "lamp", "urban"], slotId: "west-street-lamp-far",
        minimumDensity: "rich", positionFactor: [-0.29, 0.2], dimensions: [0.5, 2.85, 0.3], yaw: 0.2,
      },
      {
        renderKind: "asset", searchTags: ["ornate", "street", "lamp", "urban"], slotId: "east-street-lamp-far",
        minimumDensity: "rich", positionFactor: [0.29, 0.38], dimensions: [0.5, 2.85, 0.3], yaw: -0.12,
      },
    ],
  },
  {
    anyTags: ["industrial-pipes"],
    slots: [
      {
        renderKind: "asset", searchTags: ["industrial", "pipes", "valve", "machinery"], slotId: "northwest-pipe-bank",
        minimumDensity: "sparse", positionFactor: [-0.31, -0.45], dimensions: [1.48, 4.76, 0.75],
        placementAnchor: "wall", wall: "north",
      },
      {
        renderKind: "asset", searchTags: ["industrial", "pipes", "valve", "machinery"], slotId: "northeast-pipe-bank",
        minimumDensity: "moderate", positionFactor: [0.31, -0.45], dimensions: [1.48, 4.76, 0.75],
        placementAnchor: "wall", wall: "north", yaw: Math.PI,
      },
    ],
  },
  {
    anyTags: ["broadleaf-trees", "oak-trees", "trees"],
    requiresOpenAir: true,
    slots: approachAssetSlots("approach-tree", ["oak", "tree", "broadleaf"], [
      ["sparse", -0.43, 0.9, 4.83, 7.36, 4.83, 0.38],
      ["sparse", 0.39, 1.05, 3.86, 5.89, 3.86, 1.51],
      ["moderate", -0.58, 1.45, 3.53, 5.38, 3.53, 2.64],
      ["moderate", 0.56, 1.58, 4.54, 6.91, 4.54, 3.77],
      ["rich", -0.28, 1.9, 2.94, 4.48, 2.94, 4.9],
      ["rich", 0.3, 2.05, 3.19, 4.86, 3.19, 6.03],
    ]),
  },
  {
    anyTags: ["hedges", "shrubs", "bushes"],
    requiresOpenAir: true,
    slots: approachAssetSlots(
      "approach-hedge",
      ["bush", "hedge", "shrub"],
      [-1, 1].flatMap((side) => [0.78, 1.1, 1.45, 1.8].map((z, index) => [
        index === 0 ? "sparse" : index < 3 ? "moderate" : "rich",
        side * (0.2 + (index % 2) * 0.035),
        z,
        2.2 + (index % 2) * 0.35,
        1.08 + (index % 2) * 0.16,
        1.65,
        side * (0.3 + index * 0.41),
      ] as ApproachSlotSpec)),
    ),
  },
  {
    anyTags: ["verge-rocks", "rocks", "boulders"],
    requiresOpenAir: true,
    slots: approachAssetSlots("approach-rock", ["rock", "stone", "boulder", "weathered", "cliff"], [
      ["moderate", -0.19, 0.74, 1.35, 0.72, 1.1, -0.18],
      ["moderate", 0.18, 1.22, 1.7, 0.88, 1.1, 0.34],
      ["rich", -0.21, 1.62, 1.35, 0.72, 1.1, 0.12],
      ["rich", 0.2, 1.94, 1.7, 0.88, 1.1, -0.3],
    ]),
  },
  {
    anyTags: ["pine-trees", "conifers"],
    requiresOpenAir: true,
    slots: [
      ...woodlandAssetSlots("woodland-authored-birch", ["authored", "organic", "birch", "textured", "tree"], [
        ["sparse", -0.25, -0.46, 3.15, 6.6, 2.7, -0.22],
        ["sparse", 0.27, -0.43, 3.35, 7.1, 2.85, 0.64],
        ["moderate", -0.29, 0.08, 3.45, 7.35, 2.95, 1.46],
        ["moderate", 0.3, 0.17, 3.1, 6.55, 2.65, 2.28],
        ["rich", -0.2, 0.39, 3.55, 7.5, 3.05, 3.12],
        ["rich", 0.21, -0.04, 3.25, 6.85, 2.75, 4.04],
      ]),
      ...woodlandAssetSlots("woodland-pine-tall", ["layered", "branching", "tall", "pine", "conifer"], [
        ["sparse", -0.42, -0.42, 4.8, 9.5, 4.8, 0.3],
        ["sparse", 0.4, -0.34, 4.35, 8.7, 4.35, 1.4],
        ["sparse", -0.44, -0.06, 5.05, 10.1, 5.05, 2.5],
        ["sparse", 0.43, 0.05, 4.55, 9, 4.55, 3.6],
        ["moderate", -0.41, 0.29, 4.3, 8.5, 4.3, 4.7],
        ["moderate", 0.38, 0.4, 4.9, 9.7, 4.9, 5.8],
        ["rich", -0.31, 0.47, 3.9, 7.8, 3.9, 0.8],
        ["rich", 0.3, -0.49, 4.1, 8.1, 4.1, 2],
      ]),
      ...woodlandAssetSlots("woodland-pine-round", ["layered", "branching", "round", "pine", "conifer"], [
        ["sparse", -0.31, -0.3, 4.2, 6.3, 4.2, 0.9],
        ["sparse", 0.3, -0.16, 4.55, 6.7, 4.55, 2.1],
        ["moderate", -0.34, 0.14, 4.75, 7.1, 4.75, 3.3],
        ["moderate", 0.32, 0.25, 4.05, 6, 4.05, 4.5],
        ["rich", -0.23, 0.4, 3.8, 5.7, 3.8, 5.7],
        ["rich", 0.22, -0.41, 4.3, 6.4, 4.3, 1.2],
      ]),
    ],
  },
  {
    anyTags: ["forest-undergrowth", "woodland-shrubs"],
    requiresOpenAir: true,
    slots: woodlandAssetSlots("woodland-shrub", ["fern", "bush", "shrub", "woodland"], [
      ["sparse", -0.27, -0.44, 2.1, 1.05, 1.55, -0.3],
      ["sparse", 0.25, -0.36, 2.35, 1.18, 1.65, 0.4],
      ["sparse", -0.3, 0.02, 2.2, 1.1, 1.6, -0.7],
      ["sparse", 0.28, 0.11, 2.5, 1.25, 1.72, 0.8],
      ["moderate", -0.26, 0.25, 2.4, 1.2, 1.7, 1.1],
      ["moderate", 0.24, 0.34, 2.1, 1.05, 1.5, -1.2],
      ["moderate", -0.18, -0.18, 1.8, 0.9, 1.35, 1.5],
      ["moderate", 0.18, 0.44, 2, 1, 1.45, -1.7],
      ["rich", -0.2, 0.46, 2.2, 1.1, 1.6, 2],
      ["rich", 0.2, -0.48, 2.35, 1.18, 1.65, -2.2],
    ]),
  },
  {
    anyTags: ["grass-tufts", "forest-grass"],
    requiresOpenAir: true,
    slots: woodlandAssetSlots("woodland-grass", ["grass", "tuft", "groundcover"], [
      ["sparse", -0.18, -0.4, 0.8, 0.5, 0.8, 0.2],
      ["sparse", 0.17, -0.28, 0.7, 0.44, 0.7, 1.4],
      ["sparse", -0.2, 0.08, 0.9, 0.56, 0.9, 2.6],
      ["sparse", 0.19, 0.2, 0.75, 0.47, 0.75, 3.8],
      ["moderate", -0.15, 0.34, 0.85, 0.53, 0.85, 5],
      ["moderate", 0.14, 0.44, 0.7, 0.44, 0.7, 6.2],
      ["moderate", -0.22, -0.12, 0.75, 0.47, 0.75, 1],
      ["moderate", 0.21, 0.02, 0.85, 0.53, 0.85, 2.2],
      ["rich", -0.12, -0.25, 0.65, 0.41, 0.65, 3.4],
      ["rich", 0.11, 0.31, 0.8, 0.5, 0.8, 4.6],
      ["rich", -0.24, 0.43, 0.9, 0.56, 0.9, 5.8],
      ["rich", 0.23, -0.43, 0.75, 0.47, 0.75, 0.7],
    ]),
  },
  {
    anyTags: ["wild-mushrooms", "forest-fungi"],
    requiresOpenAir: true,
    slots: woodlandAssetSlots("woodland-mushroom", ["red", "mushroom", "fungi"], [
      ["moderate", -0.13, -0.34, 0.55, 0.5, 0.55, 0.4],
      ["moderate", 0.12, -0.06, 0.48, 0.44, 0.48, 1.5],
      ["rich", -0.16, 0.18, 0.6, 0.54, 0.6, 2.6],
      ["rich", 0.15, 0.39, 0.52, 0.47, 0.52, 3.7],
      ["rich", -0.23, 0.32, 0.46, 0.42, 0.46, 4.8],
      ["rich", 0.22, -0.22, 0.58, 0.53, 0.58, 5.9],
    ]),
  },
  {
    anyTags: ["fallen-logs", "deadwood"],
    requiresOpenAir: true,
    slots: woodlandAssetSlots("woodland-log", ["fallen", "log", "deadwood"], [
      ["sparse", -0.22, -0.02, 3.4, 0.75, 1.1, 0.25],
      ["moderate", 0.24, 0.29, 3, 0.68, 1, -0.45],
      ["rich", -0.25, 0.39, 2.7, 0.62, 0.95, 0.72],
    ]),
  },
  {
    anyTags: ["forest-rocks", "mossy-rocks"],
    requiresOpenAir: true,
    slots: woodlandAssetSlots("woodland-rock", ["rock", "stone", "woodland", "weathered", "cliff"], [
      ["sparse", -0.2, -0.48, 1.45, 0.78, 1.15, -0.2],
      ["sparse", 0.22, -0.33, 1.7, 0.9, 1.3, 0.35],
      ["moderate", -0.24, 0.21, 1.3, 0.7, 1, 0.8],
      ["moderate", 0.2, 0.42, 1.55, 0.82, 1.2, -0.65],
      ["rich", -0.17, 0.47, 1.2, 0.64, 0.95, 1.2],
    ]),
  },
];

interface OccupiedVolume {
  id: string;
  position: Vector3Tuple;
  dimensions: Vector3Tuple;
  yaw: number;
  semanticTags: string[];
  supportTopY?: number;
  supportDimensions?: Vector3Tuple;
}

function tokens(values: readonly string[]): Set<string> {
  return new Set(values.flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)));
}

function chooseAsset(
  searchTags: readonly string[],
  styleKitId: string,
  placementAnchor: DressingPlacementAnchor,
  allowWallStanding: boolean,
): AssetKitCatalogAsset | undefined {
  const requested = tokens(searchTags);
  return assetKitCatalog.assets
    .filter((asset) => {
      const compatiblePlacement = placementAnchor === "floor"
        ? asset.placement === "floor" || asset.placement === "free" ||
          (allowWallStanding && asset.placement === "wall")
        : placementAnchor === "ceiling"
          ? asset.placement === "free"
          : asset.placement === placementAnchor;
      return compatiblePlacement &&
        asset.styleKitIds.includes(styleKitId) &&
        Boolean(asset.runtimeAsset.modelUrl || asset.runtimeAsset.safeMeshUrl);
    })
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
    yaw: item.rotation[1],
    semanticTags: [
      item.entity.kind,
      item.entity.name,
      item.asset.key,
      ...(item.entity.aliases ?? []),
    ],
    supportTopY: supportSurfaceWorldY(item),
    supportDimensions: scaled,
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
): {
  position: Vector3Tuple;
  footprint: Vector3Tuple;
  placementStatus: "preferred" | "rerouted";
  supportId?: string;
} | undefined {
  const yaw = slot.yaw ?? 0;
  const footprint = rotatedDimensions(slot.dimensions, yaw);
  const placementAnchor = slot.placementAnchor ?? "floor";

  if (placementAnchor === "surface") {
    const requested = tokens(slot.supportSearchTags ?? ["table", "desk", "console", "mantel"]);
    const supports = occupied
      .map((support) => {
        const available = tokens(support.semanticTags);
        let score = 0;
        for (const token of requested) if (available.has(token)) score += 1;
        const supportCapable = [
          "table", "desk", "console", "mantel", "fireplace", "hearth", "counter", "workbench", "lectern",
        ].some((token) => available.has(token));
        return { support, score, supportCapable };
      })
      .filter(({ support, score, supportCapable }) =>
        score > 0 && supportCapable && support.supportTopY !== undefined,
      )
      .sort((left, right) => right.score - left.score || left.support.id.localeCompare(right.support.id));

    const normalizedOffsets: Array<[number, number]> = [
      [0, 0], [-0.62, -0.5], [0.62, -0.5], [-0.62, 0.5], [0.62, 0.5],
      [0, -0.58], [0, 0.58], [-0.68, 0], [0.68, 0],
    ];
    for (const { support } of supports) {
      const supportDimensions = support.supportDimensions ?? support.dimensions;
      const localReachX = Math.max(0, supportDimensions[0] / 2 - slot.dimensions[0] / 2 - 0.045);
      const localReachZ = Math.max(0, supportDimensions[2] / 2 - slot.dimensions[2] / 2 - 0.045);
      for (const [index, [factorX, factorZ]] of normalizedOffsets.entries()) {
        const localX = factorX * localReachX;
        const localZ = factorZ * localReachZ;
        const position: Vector3Tuple = [
          support.position[0] + localX * Math.cos(support.yaw) + localZ * Math.sin(support.yaw),
          support.supportTopY! + slot.dimensions[1] / 2 + 0.008 + (slot.verticalOffset ?? 0),
          support.position[2] - localX * Math.sin(support.yaw) + localZ * Math.cos(support.yaw),
        ];
        const candidate: OccupiedVolume = {
          id: slot.slotId,
          position,
          dimensions: footprint,
          yaw,
          semanticTags: [],
        };
        if (!occupied.some((other) => other.id !== support.id && overlaps(candidate, other))) {
          return {
            position,
            footprint,
            placementStatus: index === 0 ? "preferred" : "rerouted",
            supportId: support.id,
          };
        }
      }
    }
    return undefined;
  }

  const halfX = Math.max(0, bounds[0] / 2 - footprint[0] / 2 - 0.18);
  const halfZ = Math.max(0, bounds[2] / 2 - footprint[2] / 2 - 0.18);
  const wallHalfX = Math.max(0, bounds[0] / 2 - footprint[0] / 2 - WALL_COMPOSITION.dressingClearance);
  const wallHalfZ = Math.max(0, bounds[2] / 2 - footprint[2] / 2 - WALL_COMPOSITION.dressingClearance);
  const exterior = slot.placementRegion === "approach";
  const desiredX = exterior
    ? bounds[0] * slot.positionFactor[0]
    : slot.wall === "west"
    ? -wallHalfX
    : slot.wall === "east"
      ? wallHalfX
      : bounds[0] * slot.positionFactor[0];
  const desiredZ = exterior
    ? bounds[2] * slot.positionFactor[1]
    : slot.wall === "north"
    ? -wallHalfZ
    : slot.wall === "south"
      ? wallHalfZ
      : bounds[2] * slot.positionFactor[1];

  for (const [index, [offsetX, offsetZ]] of candidateOffsets(slot).entries()) {
    const position: Vector3Tuple = [
      exterior
        ? desiredX + offsetX
        : slot.wall === "west" || slot.wall === "east"
          ? desiredX
          : clamp(desiredX + offsetX, -halfX, halfX),
      placementAnchor === "ceiling"
        ? bounds[1] - slot.dimensions[1] / 2 - 0.04 - (slot.verticalOffset ?? 0)
        : slot.dimensions[1] / 2 + (slot.verticalOffset ?? 0),
      exterior
        ? desiredZ + offsetZ
        : slot.wall === "north" || slot.wall === "south"
          ? desiredZ
          : clamp(desiredZ + offsetZ, -halfZ, halfZ),
    ];
    const candidate: OccupiedVolume = {
      id: slot.slotId,
      position,
      dimensions: footprint,
      yaw,
      semanticTags: [],
    };
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
    if (rule.excludeArchetypes?.includes(presentation.location.archetype)) continue;
    if (rule.requiresOpenAir && !presentation.architecture.openAir) continue;
    if (rule.requiresArchitecture && !presentation.architecture[rule.requiresArchitecture]) continue;
    if (rule.excludeTags?.some((tag) => selectedTags.has(tag))) continue;
    const sourceTag = rule.anyTags.find((tag) => selectedTags.has(tag));
    if (!sourceTag) continue;
    for (const slot of rule.slots) {
      if (DENSITY_RANK[presentation.dressing.density] < DENSITY_RANK[slot.minimumDensity]) continue;
      const placementAnchor = slot.placementAnchor ?? "floor";
      const catalogAsset = slot.renderKind === "asset"
        ? chooseAsset(
            slot.searchTags,
            styleKitId,
            placementAnchor,
            placementAnchor === "floor" && Boolean(slot.wall),
          )
        : undefined;
      if (slot.renderKind === "asset" && !catalogAsset) continue;
      const placed = placeSlot(slot, layout.location.bounds ?? [12, 4.5, 10], occupied);
      if (!placed) continue;
      const dressingId = `${layout.location.id}:dressing:${sourceTag}:${slot.slotId}`;
      occupied.push({
        id: dressingId,
        position: placed.position,
        dimensions: placed.footprint,
        yaw: slot.yaw ?? 0,
        semanticTags: slot.renderKind === "asset" && catalogAsset
          ? [
              ...catalogAsset.roles,
              ...catalogAsset.assetKeys,
              ...catalogAsset.semanticKinds,
              ...catalogAsset.tags,
            ]
          : [slot.slotId, ...(slot.renderKind === "module" ? [slot.moduleKey] : [])],
        supportTopY: slot.renderKind === "asset" && catalogAsset
          ? placed.position[1] - slot.dimensions[1] / 2 +
            slot.dimensions[1] * (catalogAssetDefinition(catalogAsset).supportSurfaceY ?? 1)
          : undefined,
        supportDimensions: slot.dimensions,
      });
      const common: ResolvedDressingCommon = {
        dressingId,
        locationId: layout.location.id,
        sourceTag,
        decorativeOnly: true,
        density: presentation.dressing.density,
        placementStatus: placed.placementStatus,
        placementRegion: slot.placementRegion ?? "interior",
        position: placed.position,
        rotation: [0, slot.yaw ?? 0, 0],
        dimensions: slot.dimensions,
        wall: slot.wall,
        placementAnchor,
        supportId: placed.supportId,
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
