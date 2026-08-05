/**
 * Stable integration surface for the reader application (Member 3).
 *
 * Demo panels, provider implementations, and scene-build internals deliberately
 * stay behind this boundary. Additions here are a compatibility commitment.
 */
export {
  WorldViewer,
  type WorldViewerErrorCode,
  type WorldViewerProps,
  type WorldViewerRuntimeError,
} from "./components/WorldViewer";
export {
  EntityInspector,
  type EntityInspectorProps,
} from "./components/EntityInspector";

export * from "./contracts/world";
export * from "./contracts/visualScenePlan";
export {
  ContractValidationError,
  ConflictSchema,
  EntitySchema,
  LocationSchema,
  PatchOperationSchema,
  ScenePatchSchema,
  SpatialRelationSchema,
  TransformSchema,
  WorldSnapshotSchema,
  validateScenePatch,
  validateWorldSnapshot,
  type ContractName,
} from "./contracts/validation";

export {
  PatchVersionError,
  applyScenePatch,
} from "./runtime/applyScenePatch";
export {
  defaultAssetRegistry,
  resolveAsset,
  type AssetDefinition,
  type AssetRegistry,
  type PrimitiveGeometry,
} from "./runtime/assetRegistry";
export {
  compilePlacementConstraints,
  compileSceneRecipe,
  type CompiledSceneRecipe,
  type LocationSceneRecipe,
  type PlacementConstraintKind,
  type SceneAssetCoverage,
  type ScenePlacementConstraint,
} from "./runtime/sceneRecipeCompiler";

export {
  OrderedWorldStream,
  useWorldStream,
  type PatchIngestResult,
  type WorldStreamBinding,
  type WorldStreamStatus,
} from "./integration/worldStream";
export {
  VisualScenePlanSchema,
  StoryPackageValidationError,
  parseStoryPackageJson,
  preflightStoryPackage,
  runtimeStoryFromPackage,
  validateStoryPackage,
  type RuntimeStory,
  type StoryPackage,
  type StoryPackageMoment,
  type StoryPackagePreflightMoment,
  type StoryPackagePreflightReport,
} from "./integration/storyPackage";
export {
  LivePart1StorySession,
  Part1AdapterError,
  normalizePart1PassageResponse,
  type NormalizedPart1PassageResponse,
  type Part1AdapterErrorCode,
  type Part1IngestResult,
  type Part1PassageRequest,
  type Part1ProcessingSummary,
} from "./integration/part1Adapter";
