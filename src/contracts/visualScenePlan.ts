export type VisualInferenceBasis =
  | "explicit_text"
  | "cross_passage_inference"
  | "art_direction_default";

export interface VisualEvidence {
  passageIds: string[];
  confidence: number;
  basis: VisualInferenceBasis;
  note?: string;
}

export interface ScenePalette {
  background: string;
  fog: string;
  floor: string;
  wall: string;
  timber: string;
  ambient: string;
  keyLight: string;
  practical: string;
}

export interface VisualLocationPlan {
  locationId: string;
  archetype: "timber-attic" | "archive-vault" | "generic-interior" | (string & {});
  visualDescription: string;
  architectureTags: string[];
  dressingTags: string[];
  dressingDensity: "sparse" | "moderate" | "rich";
  mood: string;
  timeOfDay: string;
  palette: ScenePalette;
  lighting: {
    warmth: "cool" | "neutral" | "warm";
    contrast: "low" | "medium" | "high";
    ambientIntensity: number;
    keyIntensity: number;
    atmosphericEffects: string[];
  };
  evidence: VisualEvidence;
}

export interface VisualEntityPlan {
  entityId: string;
  visualDescription: string;
  importance: "background" | "supporting" | "hero";
  materials: string[];
  colors: string[];
  condition?: string;
  assetSearchTags: string[];
  assetGenerationPrompt?: string;
  evidence: VisualEvidence;
}

export interface PresentationConnection {
  entityId: string;
  fromLocationId: string;
  targetLocationId: string;
  presentationOnly: boolean;
  evidence: VisualEvidence;
}

/** Companion visual-planning surface. Canonical facts remain in WorldSnapshot. */
export interface VisualScenePlan {
  schemaVersion: "1.0";
  storyId: string;
  segmentId: string;
  sourcePassageIds: string[];
  snapshotVersion: number;
  planVersion: number;
  previousPlanVersion?: number;
  artDirection: {
    styleLabel: string;
    stylePrompt: string;
    negativePrompt: string[];
    materialVocabulary: string[];
  };
  locations: VisualLocationPlan[];
  entities: VisualEntityPlan[];
  presentationConnections: PresentationConnection[];
  unresolvedQuestions: string[];
}
