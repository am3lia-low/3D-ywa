import type { WorldSnapshot } from "../contracts/world";
import type {
  ScenePalette,
  VisualEntityPlan,
  VisualLocationPlan,
  VisualScenePlan,
} from "../contracts/visualScenePlan";

export interface AssetGenerationRequest {
  entityId: string;
  prompt: string;
  searchTags: string[];
  priority: "supporting" | "hero";
}

export type SceneEnvironmentModuleId =
  | "shell:solid-room"
  | "shell:glasshouse"
  | "shell:open-air"
  | "surface:wood-floorboards"
  | "surface:stone-tiles"
  | "surface:cobblestone"
  | "surface:forest-floor"
  | "surface:neutral-floor"
  | "path:earth-trail"
  | "wall:aged-plaster"
  | "structure:timber-frame"
  | "structure:iron-frame"
  | "structure:archive-shelves"
  | "structure:stone-arcade"
  | "boundary:courtyard-wall"
  | "boundary:woodland-edge"
  | "opening:small-window";

export type SceneDressingModuleId =
  | "dressing:books"
  | "dressing:storage-crates"
  | "dressing:travel-chest"
  | "dressing:planters"
  | "dressing:climbing-vines"
  | "dressing:rain-puddles"
  | "dressing:wall-ivy"
  | "dressing:fallen-leaves"
  | "dressing:courtyard-clutter"
  | "dressing:broadleaf-trees"
  | "dressing:hedges"
  | "dressing:verge-rocks"
  | "dressing:pine-trees"
  | "dressing:forest-undergrowth"
  | "dressing:grass-tufts"
  | "dressing:wild-mushrooms"
  | "dressing:fallen-logs"
  | "dressing:forest-rocks";

export interface SceneModuleSelection<TModuleId extends string> {
  moduleId: TModuleId;
  sourceTags: string[];
}

export interface ScenePresentation {
  planVersion: number;
  styleLabel: string;
  location: VisualLocationPlan;
  palette: ScenePalette;
  modules: {
    environment: SceneModuleSelection<SceneEnvironmentModuleId>[];
    dressing: SceneModuleSelection<SceneDressingModuleId>[];
  };
  architecture: {
    floorboards: boolean;
    plasterWalls: boolean;
    timberFrame: boolean;
    window: boolean;
    archiveShelves: boolean;
    glasshousePanels: boolean;
    ironFrame: boolean;
    stoneTileFloor: boolean;
    openAir: boolean;
    cobblestone: boolean;
    forestFloor: boolean;
    earthTrail: boolean;
    stoneArcade: boolean;
    courtyardWalls: boolean;
    woodlandEdge: boolean;
  };
  dressing: {
    books: boolean;
    storageCrates: boolean;
    travelChest: boolean;
    planters: boolean;
    climbingVines: boolean;
    rainPuddles: boolean;
    wallIvy: boolean;
    fallenLeaves: boolean;
    courtyardClutter: boolean;
    broadleafTrees: boolean;
    hedges: boolean;
    vergeRocks: boolean;
    density: VisualLocationPlan["dressingDensity"];
  };
  atmosphere: {
    dust: boolean;
    coolWindowLight: boolean;
    rain: boolean;
    groundMist: boolean;
  };
  portalTargetLocationId?: string;
  assetRequests: AssetGenerationRequest[];
}

const ENVIRONMENT_MODULE_RULES: ReadonlyArray<{
  moduleId: SceneEnvironmentModuleId;
  anyTags: string[];
}> = [
  { moduleId: "shell:glasshouse", anyTags: ["glasshouse-panels", "arched-glazing"] },
  { moduleId: "shell:open-air", anyTags: ["open-air", "open-courtyard"] },
  { moduleId: "surface:wood-floorboards", anyTags: ["wood-floorboards"] },
  { moduleId: "surface:stone-tiles", anyTags: ["stone-tile-floor"] },
  { moduleId: "surface:cobblestone", anyTags: ["cobblestone", "cobblestone-courtyard"] },
  { moduleId: "surface:forest-floor", anyTags: ["forest-floor", "mossy-ground", "woodland-ground"] },
  { moduleId: "path:earth-trail", anyTags: ["earth-trail", "winding-path", "forest-path"] },
  { moduleId: "wall:aged-plaster", anyTags: ["aged-plaster"] },
  { moduleId: "structure:timber-frame", anyTags: ["timber-frame"] },
  { moduleId: "structure:iron-frame", anyTags: ["iron-frame"] },
  { moduleId: "structure:archive-shelves", anyTags: ["archive-shelving"] },
  { moduleId: "structure:stone-arcade", anyTags: ["stone-arcade", "cloister-arches"] },
  { moduleId: "boundary:courtyard-wall", anyTags: ["courtyard-walls", "weathered-masonry"] },
  { moduleId: "boundary:woodland-edge", anyTags: ["woodland-edge", "forest-boundary", "dense-tree-line"] },
  { moduleId: "opening:small-window", anyTags: ["small-window"] },
];

const DRESSING_MODULE_RULES: ReadonlyArray<{
  moduleId: SceneDressingModuleId;
  anyTags: string[];
}> = [
  { moduleId: "dressing:books", anyTags: ["books"] },
  { moduleId: "dressing:storage-crates", anyTags: ["storage-crates"] },
  { moduleId: "dressing:travel-chest", anyTags: ["travel-chest"] },
  { moduleId: "dressing:planters", anyTags: ["planters", "ceramic-pots"] },
  { moduleId: "dressing:climbing-vines", anyTags: ["climbing-vines"] },
  { moduleId: "dressing:rain-puddles", anyTags: ["rain-puddles", "wet-stone"] },
  { moduleId: "dressing:wall-ivy", anyTags: ["wall-ivy", "ivy"] },
  { moduleId: "dressing:fallen-leaves", anyTags: ["fallen-leaves", "leaf-litter"] },
  { moduleId: "dressing:courtyard-clutter", anyTags: ["courtyard-clutter", "coaching-yard-clutter"] },
  { moduleId: "dressing:broadleaf-trees", anyTags: ["broadleaf-trees", "oak-trees", "trees"] },
  { moduleId: "dressing:hedges", anyTags: ["hedges", "shrubs", "bushes"] },
  { moduleId: "dressing:verge-rocks", anyTags: ["verge-rocks", "rocks", "boulders"] },
  { moduleId: "dressing:pine-trees", anyTags: ["pine-trees", "conifers"] },
  { moduleId: "dressing:forest-undergrowth", anyTags: ["forest-undergrowth", "woodland-shrubs"] },
  { moduleId: "dressing:grass-tufts", anyTags: ["grass-tufts", "forest-grass"] },
  { moduleId: "dressing:wild-mushrooms", anyTags: ["wild-mushrooms", "forest-fungi"] },
  { moduleId: "dressing:fallen-logs", anyTags: ["fallen-logs", "deadwood"] },
  { moduleId: "dressing:forest-rocks", anyTags: ["forest-rocks", "mossy-rocks"] },
];

function selectModules<TModuleId extends string>(
  tags: ReadonlySet<string>,
  rules: ReadonlyArray<{ moduleId: TModuleId; anyTags: string[] }>,
): SceneModuleSelection<TModuleId>[] {
  return rules.flatMap((rule) => {
    const sourceTags = rule.anyTags.filter((tag) => tags.has(tag));
    return sourceTags.length > 0 ? [{ moduleId: rule.moduleId, sourceTags }] : [];
  });
}

function environmentModules(
  architectureTags: ReadonlySet<string>,
): SceneModuleSelection<SceneEnvironmentModuleId>[] {
  const selected = selectModules(architectureTags, ENVIRONMENT_MODULE_RULES);
  const hasGlasshouse = selected.some((module) => module.moduleId === "shell:glasshouse");
  const hasOpenAir = selected.some((module) => module.moduleId === "shell:open-air");
  const hasFloor = selected.some((module) => module.moduleId.startsWith("surface:"));
  return [
    ...(!hasGlasshouse && !hasOpenAir
      ? [{ moduleId: "shell:solid-room" as const, sourceTags: [] }]
      : []),
    ...(!hasFloor
      ? [{ moduleId: "surface:neutral-floor" as const, sourceTags: [] }]
      : []),
    ...selected,
  ];
}

export class ScenePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenePlanError";
  }
}

export function visualAssetPrompt(visual: VisualEntityPlan): string {
  if (visual.assetGenerationPrompt) return visual.assetGenerationPrompt;
  return [
    visual.visualDescription,
    visual.materials.join(", "),
    visual.colors.join(", "),
    visual.condition ? `Condition: ${visual.condition}.` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function requireCanonicalJoins(plan: VisualScenePlan, snapshot: WorldSnapshot): void {
  if (plan.storyId !== snapshot.storyId) {
    throw new ScenePlanError(`Visual plan story '${plan.storyId}' does not match '${snapshot.storyId}'.`);
  }
  if (plan.snapshotVersion > snapshot.version) {
    throw new ScenePlanError(
      `Visual plan requires world v${plan.snapshotVersion}, but the runtime is at v${snapshot.version}.`,
    );
  }

  const locationIds = new Set(snapshot.locations.map((location) => location.id));
  const entityIds = new Set(snapshot.entities.map((entity) => entity.id));
  for (const location of plan.locations) {
    if (!locationIds.has(location.locationId)) {
      throw new ScenePlanError(`Visual location '${location.locationId}' is not canonical.`);
    }
  }
  for (const entity of plan.entities) {
    if (!entityIds.has(entity.entityId)) {
      throw new ScenePlanError(`Visual entity '${entity.entityId}' is not canonical.`);
    }
  }
  for (const connection of plan.presentationConnections) {
    if (
      !entityIds.has(connection.entityId) ||
      !locationIds.has(connection.fromLocationId) ||
      !locationIds.has(connection.targetLocationId)
    ) {
      throw new ScenePlanError(`Presentation connection '${connection.entityId}' has a broken join.`);
    }
  }
}

function createAssetRequests(
  entities: readonly VisualEntityPlan[],
  snapshot: WorldSnapshot,
): AssetGenerationRequest[] {
  const worldEntities = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  return entities.flatMap((visual) => {
    const entity = worldEntities.get(visual.entityId);
    if (!entity || entity.assetKey || visual.importance === "background") return [];
    return [{
      entityId: visual.entityId,
      prompt: visualAssetPrompt(visual),
      searchTags: visual.assetSearchTags,
      priority: visual.importance,
    }];
  });
}

/** Compiles novel-derived visual context into deterministic renderer decisions. */
export function compileScenePresentation(
  plan: VisualScenePlan,
  snapshot: WorldSnapshot,
  locationId: string,
): ScenePresentation {
  requireCanonicalJoins(plan, snapshot);
  const location = plan.locations.find((candidate) => candidate.locationId === locationId);
  if (!location) {
    throw new ScenePlanError(`No visual plan exists for location '${locationId}'.`);
  }

  const architectureTags = new Set(location.architectureTags);
  const dressingTags = new Set(location.dressingTags);
  const connection = plan.presentationConnections.find(
    (candidate) => candidate.fromLocationId === locationId,
  );
  const selectedEnvironmentModules = environmentModules(architectureTags);
  const selectedDressingModules = selectModules(dressingTags, DRESSING_MODULE_RULES);

  return {
    planVersion: plan.planVersion,
    styleLabel: plan.artDirection.styleLabel,
    location,
    palette: location.palette,
    modules: {
      environment: selectedEnvironmentModules,
      dressing: selectedDressingModules,
    },
    architecture: {
      floorboards: architectureTags.has("wood-floorboards"),
      plasterWalls: architectureTags.has("aged-plaster"),
      timberFrame: architectureTags.has("timber-frame"),
      window: architectureTags.has("small-window"),
      archiveShelves: architectureTags.has("archive-shelving"),
      glasshousePanels: architectureTags.has("glasshouse-panels"),
      ironFrame: architectureTags.has("iron-frame"),
      stoneTileFloor: architectureTags.has("stone-tile-floor"),
      openAir: architectureTags.has("open-air") || architectureTags.has("open-courtyard"),
      cobblestone: architectureTags.has("cobblestone") || architectureTags.has("cobblestone-courtyard"),
      forestFloor: ["forest-floor", "mossy-ground", "woodland-ground"].some((tag) => architectureTags.has(tag)),
      earthTrail: ["earth-trail", "winding-path", "forest-path"].some((tag) => architectureTags.has(tag)),
      stoneArcade: architectureTags.has("stone-arcade") || architectureTags.has("cloister-arches"),
      courtyardWalls: architectureTags.has("courtyard-walls") || architectureTags.has("weathered-masonry"),
      woodlandEdge: ["woodland-edge", "forest-boundary", "dense-tree-line"].some((tag) => architectureTags.has(tag)),
    },
    dressing: {
      books: dressingTags.has("books"),
      storageCrates: dressingTags.has("storage-crates"),
      travelChest: dressingTags.has("travel-chest"),
      planters: dressingTags.has("planters") || dressingTags.has("ceramic-pots"),
      climbingVines: dressingTags.has("climbing-vines"),
      rainPuddles: dressingTags.has("rain-puddles") || dressingTags.has("wet-stone"),
      wallIvy: dressingTags.has("wall-ivy") || dressingTags.has("ivy"),
      fallenLeaves: dressingTags.has("fallen-leaves") || dressingTags.has("leaf-litter"),
      courtyardClutter: dressingTags.has("courtyard-clutter") || dressingTags.has("coaching-yard-clutter"),
      broadleafTrees: ["broadleaf-trees", "oak-trees", "trees"].some((tag) => dressingTags.has(tag)),
      hedges: ["hedges", "shrubs", "bushes"].some((tag) => dressingTags.has(tag)),
      vergeRocks: ["verge-rocks", "rocks", "boulders"].some((tag) => dressingTags.has(tag)),
      density: location.dressingDensity,
    },
    atmosphere: {
      dust: location.lighting.atmosphericEffects.includes("dust-motes"),
      coolWindowLight: location.lighting.atmosphericEffects.includes("window-shaft"),
      rain: location.lighting.atmosphericEffects.includes("rain-streaks"),
      groundMist: location.lighting.atmosphericEffects.includes("ground-mist"),
    },
    portalTargetLocationId: connection?.targetLocationId,
    assetRequests: createAssetRequests(plan.entities, snapshot),
  };
}

/** Keeps WorldViewer usable when a consumer has not adopted visual planning yet. */
export function createFallbackScenePresentation(
  snapshot: WorldSnapshot,
  locationId: string,
): ScenePresentation {
  const location = snapshot.locations.find((candidate) => candidate.id === locationId);
  if (!location) throw new ScenePlanError(`Cannot create fallback for '${locationId}'.`);
  const palette: ScenePalette = {
    background: "#171b20",
    fog: "#20262a",
    floor: location.environment?.floorColor ?? "#3c3935",
    wall: location.environment?.wallColor ?? "#b7aa98",
    timber: "#44372f",
    ambient: location.environment?.ambientColor ?? "#d9d2c5",
    keyLight: "#dbe7e5",
    practical: "#ff9a52",
  };
  const visualLocation: VisualLocationPlan = {
    locationId,
    archetype: "generic-interior",
    visualDescription: location.name,
    architectureTags: [],
    dressingTags: [],
    dressingDensity: "sparse",
    mood: "neutral",
    timeOfDay: "unspecified",
    palette,
    lighting: {
      warmth: "neutral",
      contrast: "medium",
      ambientIntensity: 0.85,
      keyIntensity: 1.8,
      atmosphericEffects: [],
    },
    evidence: {
      passageIds: [snapshot.passageId],
      confidence: 0,
      basis: "art_direction_default",
    },
  };
  return {
    planVersion: 0,
    styleLabel: "generic fallback",
    location: visualLocation,
    palette,
    modules: {
      environment: [
        { moduleId: "shell:solid-room", sourceTags: [] },
        { moduleId: "surface:neutral-floor", sourceTags: [] },
      ],
      dressing: [],
    },
    architecture: {
      floorboards: false,
      plasterWalls: false,
      timberFrame: false,
      window: false,
      archiveShelves: false,
      glasshousePanels: false,
      ironFrame: false,
      stoneTileFloor: false,
      openAir: false,
      cobblestone: false,
      forestFloor: false,
      earthTrail: false,
      stoneArcade: false,
      courtyardWalls: false,
      woodlandEdge: false,
    },
    dressing: {
      books: false,
      storageCrates: false,
      travelChest: false,
      planters: false,
      climbingVines: false,
      rainPuddles: false,
      wallIvy: false,
      fallenLeaves: false,
      courtyardClutter: false,
      broadleafTrees: false,
      hedges: false,
      vergeRocks: false,
      density: "sparse",
    },
    atmosphere: { dust: false, coolWindowLight: false, rain: false, groundMist: false },
    assetRequests: [],
  };
}
