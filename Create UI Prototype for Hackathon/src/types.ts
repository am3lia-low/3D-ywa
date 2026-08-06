import type {
  CompiledSceneRecipe,
  ScenePatch as SpatialScenePatch,
  VisualScenePlan,
  WorldSnapshot as SpatialWorldSnapshot,
} from '@spatial-runtime'

// Shared types for the frontend. These mirror the PRD's data model (Book, Chapter,
// ChapterProcessingResult, FrontendState, etc.) so the mock API layer in `src/api/mockApi.ts`
// and the `WorldViewer` component can be swapped for Member 1/Member 2's real
// implementations later without changing these shapes or anything that consumes them.

// ─── Core product entities ──────────────────────────────────────────────────

export interface Book {
  id: string
  title: string
  author?: string
  coverUrl?: string
  description?: string
  chapters: Chapter[]
}

export type ChapterProcessingStatus = 'not_started' | 'processing' | 'ready' | 'failed'

export interface Chapter {
  id: string
  bookId: string
  index: number
  title: string
  content: string
  processingStatus: ChapterProcessingStatus
  snapshotVersion?: number
}

export interface ChapterProcessingResult {
  chapterId: string
  snapshot: WorldSnapshot
  patch: ScenePatch
  spatialSnapshot: SpatialWorldSnapshot
  spatialPatch: SpatialScenePatch | null
  visualPlan: VisualScenePlan
  sceneRecipe: CompiledSceneRecipe
  summary: ChapterUpdateSummary
  conflicts: Conflict[]
}

export interface ChapterUpdateSummary {
  addedEntityIds: string[]
  movedEntityIds: string[]
  updatedEntityIds: string[]
  removedEntityIds: string[]
  unchangedEntityIds: string[]
}

// ─── World / scene contract (the shape Member 2's WorldViewer consumes) ────

export type EntityStatus = 'unchanged' | 'moved' | 'updated' | 'added' | 'removed'
export type EvidenceType = 'Explicit' | 'Inferred' | 'Visual default'

export interface WorldEntity {
  id: string
  name: string
  status: EntityStatus
  position: { x: number; y: number }
  radius: number
  introducedInChapterId?: string
  changedInChapterId?: string
  currentLocation?: string
  currentCondition?: string
  previousLocation?: string
  previousCondition?: string
  sourceSentence?: string
  evidenceType?: EvidenceType
}

export interface WorldSnapshot {
  chapterId: string
  entities: WorldEntity[]
}

export interface ScenePatch {
  chapterId: string
  addedEntityIds: string[]
  movedEntityIds: string[]
  updatedEntityIds: string[]
  removedEntityIds: string[]
}

// ─── Object inspection ──────────────────────────────────────────────────────

export interface EntityHistoryItem {
  chapterId: string
  change: string
}

export interface EntityInspectionData {
  id: string
  canonicalName: string
  entityType: string
  currentLocation?: string
  currentCondition?: string
  introducedInChapterId?: string
  latestUpdatedChapterId?: string
  currentEvidence?: { sourceSentence: string; evidenceType: EvidenceType }
  history?: EntityHistoryItem[]
}

// ─── Admin / conflicts ──────────────────────────────────────────────────────

export interface EvidenceClaim {
  chapterId: string
  statement: string
}

export type ConflictResolution = 'earlier' | 'latest' | 'unresolved'

export interface Conflict {
  id: string
  entityId: string
  earlierClaim: EvidenceClaim
  latestClaim: EvidenceClaim
  activeInterpretation: ConflictResolution
  status: 'open' | 'resolved'
  confidenceNote?: string
}

export type UserRole = 'reader' | 'admin'

// ─── Processing ─────────────────────────────────────────────────────────────

export type ProcessingStage =
  | 'idle'
  | 'understanding_chapter'
  | 'matching_entities'
  | 'updating_world'
  | 'preparing_scene'
  | 'ready'
  | 'failed'

export const PROCESSING_STAGE_LABEL: Record<ProcessingStage, string> = {
  idle: 'Preparing…',
  understanding_chapter: 'Understanding the chapter…',
  matching_entities: 'Matching existing world elements…',
  updating_world: 'Updating object positions and states…',
  preparing_scene: 'Preparing the 3D scene…',
  ready: 'Scene ready',
  failed: 'Scene processing failed',
}

// ─── Application modes ──────────────────────────────────────────────────────
//
// The PRD's §3 AppMode union lists "processing" alongside these values, but its
// own text argues processing should be tracked as a separate status rather than
// a top-level mode — and §13's FrontendState.appMode agrees by omitting it.
// We follow that resolution here: processing is represented by ProcessingStage,
// not by AppMode.
export type AppMode = 'library' | 'importing_book' | 'reading' | 'exploring' | 'admin_review'

// ─── Frontend state ─────────────────────────────────────────────────────────

export interface FrontendState {
  activeBookId: string | null

  readerChapterId: string | null
  latestProcessedChapterId: string | null
  displayedTextChapterId: string | null

  activeSnapshot: WorldSnapshot | null
  activePatch: ScenePatch | null

  processingStage: ProcessingStage
  processingError: string | null

  // objectInspectorOpen is intentionally omitted: it is fully derived from
  // `selectedEntityId !== null`, so keeping a separate flag would just be a
  // second source of truth that can drift out of sync with it.
  selectedEntityId: string | null
  highlightedEntityIds: string[]

  chapterDrawerOpen: boolean
  updateSummaryOpen: boolean
  adminPanelOpen: boolean

  userRole: UserRole
  unresolvedConflicts: Conflict[]

  appMode: AppMode
}
