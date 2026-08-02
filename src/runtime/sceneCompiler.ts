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

export interface ScenePresentation {
  planVersion: number;
  styleLabel: string;
  location: VisualLocationPlan;
  palette: ScenePalette;
  architecture: {
    floorboards: boolean;
    plasterWalls: boolean;
    timberFrame: boolean;
    window: boolean;
    archiveShelves: boolean;
  };
  dressing: {
    books: boolean;
    storageCrates: boolean;
    travelChest: boolean;
    density: VisualLocationPlan["dressingDensity"];
  };
  atmosphere: {
    dust: boolean;
    coolWindowLight: boolean;
  };
  portalTargetLocationId?: string;
  assetRequests: AssetGenerationRequest[];
}

export class ScenePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenePlanError";
  }
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
      prompt:
        visual.assetGenerationPrompt ??
        `${visual.visualDescription}. ${visual.materials.join(", ")}. ${visual.colors.join(", ")}.`,
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

  return {
    planVersion: plan.planVersion,
    styleLabel: plan.artDirection.styleLabel,
    location,
    palette: location.palette,
    architecture: {
      floorboards: architectureTags.has("wood-floorboards"),
      plasterWalls: architectureTags.has("aged-plaster"),
      timberFrame: architectureTags.has("timber-frame"),
      window: architectureTags.has("small-window"),
      archiveShelves: architectureTags.has("archive-shelving"),
    },
    dressing: {
      books: dressingTags.has("books"),
      storageCrates: dressingTags.has("storage-crates"),
      travelChest: dressingTags.has("travel-chest"),
      density: location.dressingDensity,
    },
    atmosphere: {
      dust: location.lighting.atmosphericEffects.includes("dust-motes"),
      coolWindowLight: location.lighting.atmosphericEffects.includes("window-shaft"),
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
    architecture: {
      floorboards: false,
      plasterWalls: false,
      timberFrame: false,
      window: false,
      archiveShelves: false,
    },
    dressing: {
      books: false,
      storageCrates: false,
      travelChest: false,
      density: "sparse",
    },
    atmosphere: { dust: false, coolWindowLight: false },
    assetRequests: [],
  };
}
