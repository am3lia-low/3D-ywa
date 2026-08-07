import {
  LivePart1StorySession,
  compileSceneRecipe,
  normalizePart1PassageResponse,
  postPart1Passage,
  type Entity as SpatialEntity,
  type ScenePatch as SpatialScenePatch,
  type WorldSnapshot as SpatialWorldSnapshot,
} from '../../../src/index'
import type {
  Book,
  Chapter,
  ChapterProcessingResult,
  ChapterUpdateSummary,
  Conflict,
  EntityStatus,
  EvidenceType,
  ProcessingStage,
  ScenePatch,
  WorldEntity,
  WorldSnapshot,
} from '../types'

const sessions = new Map<string, LivePart1StorySession>()

function sessionFor(book: Book): LivePart1StorySession {
  let session = sessions.get(book.id)
  if (!session) {
    session = new LivePart1StorySession(book.title)
    sessions.set(book.id, session)
  }
  return session
}

export function configuredPart1ApiBaseUrl(): string | undefined {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>
  }).env
  return env?.VITE_STORYWORLD_API_URL?.trim() || undefined
}

function patchSummary(
  snapshot: SpatialWorldSnapshot,
  patch: SpatialScenePatch | undefined,
): ChapterUpdateSummary {
  const addedEntityIds: string[] = []
  const movedEntityIds: string[] = []
  const updatedEntityIds: string[] = []
  const removedEntityIds: string[] = []

  if (!patch) {
    addedEntityIds.push(...snapshot.entities.map(entity => entity.id))
  } else {
    for (const operation of patch.operations) {
      if (operation.op === 'add_entity') addedEntityIds.push(operation.entity.id)
      else if (operation.op === 'move_entity') movedEntityIds.push(operation.entityId)
      else if (operation.op === 'update_entity') updatedEntityIds.push(operation.entityId)
      else if (operation.op === 'remove_entity') removedEntityIds.push(operation.entityId)
    }
  }

  const changed = new Set([
    ...addedEntityIds,
    ...movedEntityIds,
    ...updatedEntityIds,
    ...removedEntityIds,
  ])
  return {
    addedEntityIds,
    movedEntityIds,
    updatedEntityIds,
    removedEntityIds,
    unchangedEntityIds: snapshot.entities
      .map(entity => entity.id)
      .filter(entityId => !changed.has(entityId)),
  }
}

function entityStatus(entityId: string, summary: ChapterUpdateSummary): EntityStatus {
  if (summary.addedEntityIds.includes(entityId)) return 'added'
  if (summary.movedEntityIds.includes(entityId)) return 'moved'
  if (summary.updatedEntityIds.includes(entityId)) return 'updated'
  return 'unchanged'
}

function evidenceType(entity: SpatialEntity): EvidenceType {
  if (!entity.provenance) return 'Visual default'
  return (entity.provenance.confidence ?? 1) >= 0.75 ? 'Explicit' : 'Inferred'
}

// Descriptive state keys, ordered so the prose reads as description before
// status — a "Stone, cold" fireplace rather than "Cold, stone". Keys outside
// this list are structural (semanticType, status, containerRegion,
// supportSurfaceRatio) and are never shown to readers.
const CONDITION_KEYS = [
  'condition', 'material', 'color', 'size', 'shape', 'orientation',
  'frame_style', 'temperature', 'lighting', 'length', 'state',
] as const

// Renders Member 1's structured state as a reader-facing phrase, matching the
// prepared stories' hand-authored voice ("Cold, unlit"). Derived at render time
// rather than sent by Member 1, so it cannot drift out of step with `state`
// when applyScenePatch merges an update.
function conditionText(entity: SpatialEntity): string | undefined {
  const state = entity.state ?? {}
  const values: string[] = []
  for (const key of CONDITION_KEYS) {
    const value = state[key]
    if (value === null || value === undefined || value === '') continue
    const text = String(value).trim()
    if (!text) continue
    if (values.some(existing => existing.toLowerCase() === text.toLowerCase())) continue
    values.push(text)
  }
  if (values.length === 0) return undefined
  const phrase = values.join(', ')
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}

function inspectorSnapshot(
  chapter: Chapter,
  spatialSnapshot: SpatialWorldSnapshot,
  summary: ChapterUpdateSummary,
): WorldSnapshot {
  const locations = new Map(
    spatialSnapshot.locations.map(location => [location.id, location.name]),
  )
  const entities: WorldEntity[] = spatialSnapshot.entities.map(entity => ({
    id: entity.id,
    name: entity.name,
    status: entityStatus(entity.id, summary),
    // Member 2 owns 3D placement. These legacy fields support only Member 3's
    // inspector shape and are never passed to the renderer.
    position: { x: 0, y: 0 },
    radius: 0,
    introducedInChapterId: entity.provenance?.passageId ?? chapter.id,
    changedInChapterId: summary.updatedEntityIds.includes(entity.id)
      || summary.movedEntityIds.includes(entity.id)
      ? chapter.id
      : undefined,
    currentLocation: locations.get(entity.locationId) ?? entity.locationId,
    currentCondition: conditionText(entity),
    sourceSentence: entity.provenance?.sentence,
    evidenceType: evidenceType(entity),
  }))
  return { chapterId: chapter.id, entities }
}

function inspectorPatch(
  chapter: Chapter,
  summary: ChapterUpdateSummary,
): ScenePatch {
  return {
    chapterId: chapter.id,
    addedEntityIds: summary.addedEntityIds,
    movedEntityIds: summary.movedEntityIds,
    updatedEntityIds: summary.updatedEntityIds,
    removedEntityIds: summary.removedEntityIds,
  }
}

function inspectorConflicts(
  chapter: Chapter,
  conflicts: ReturnType<typeof normalizePart1PassageResponse>['conflicts'],
): Conflict[] {
  return conflicts.map(conflict => {
    const passageIds = conflict.passageIds ?? [chapter.id]
    return {
      id: conflict.id,
      entityId: conflict.entityId ?? '',
      earlierClaim: {
        chapterId: passageIds[0] ?? chapter.id,
        statement: conflict.description,
      },
      latestClaim: {
        chapterId: passageIds.at(-1) ?? chapter.id,
        statement: conflict.description,
      },
      activeInterpretation: conflict.status === 'resolved' ? 'latest' : 'unresolved',
      status: conflict.status === 'resolved' ? 'resolved' : 'open',
    }
  })
}

async function beginStage(
  stage: ProcessingStage,
  onStage?: (stage: ProcessingStage) => void,
): Promise<void> {
  onStage?.(stage)
  await Promise.resolve()
}

export function adaptLivePart1ChapterResponse(
  book: Book,
  chapter: Chapter,
  input: unknown,
  session: LivePart1StorySession = sessionFor(book),
): ChapterProcessingResult {
  const request = {
    storyId: book.id,
    passageId: chapter.id,
    text: chapter.content,
  }
  const normalized = normalizePart1PassageResponse(input)
  const accepted = session.ingest(request, input)
  const visualPlan = normalized.visualPlan
    ?? accepted.story.visualPlans[accepted.story.visualPlans.length - 1]
  if (!visualPlan) throw new Error('Member 1 did not provide a usable visual plan.')

  const summary = patchSummary(accepted.authoritativeSnapshot, accepted.acceptedPatch)
  const snapshot = inspectorSnapshot(chapter, accepted.authoritativeSnapshot, summary)
  const patch = inspectorPatch(chapter, summary)
  const sceneRecipe = compileSceneRecipe(accepted.authoritativeSnapshot, visualPlan)
  if (sceneRecipe.composition.status === 'blocking') {
    throw new Error('Member 2 rejected the generated scene because its composition is blocking.')
  }

  return {
    chapterId: chapter.id,
    snapshot,
    patch,
    spatialSnapshot: accepted.authoritativeSnapshot,
    spatialPatch: accepted.acceptedPatch ?? null,
    visualPlan,
    sceneRecipe,
    summary,
    conflicts: inspectorConflicts(chapter, normalized.conflicts),
  }
}

export async function processLivePart1Chapter(
  baseUrl: string,
  book: Book,
  chapter: Chapter,
  onStage?: (stage: ProcessingStage) => void,
): Promise<ChapterProcessingResult> {
  await beginStage('understanding_chapter', onStage)
  const input = await postPart1Passage(baseUrl, {
    storyId: book.id,
    passageId: chapter.id,
    text: chapter.content,
  })
  await beginStage('matching_entities', onStage)
  await beginStage('updating_world', onStage)
  const result = adaptLivePart1ChapterResponse(book, chapter, input)
  await beginStage('preparing_scene', onStage)
  return result
}

export function resetLivePart1Sessions(): void {
  sessions.clear()
}
