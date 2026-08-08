// Thin adapter over the backend contract described in the PRD. Components do
// not need to know that this development build uses local mock state.

import { compileSceneRecipe } from '@spatial-runtime'
import { BOOKS, CONFLICTS, PATCHES, SNAPSHOTS, summaryFromPatch } from '../data/mockData'
import { buildMockSpatialScene } from '../spatial/mockSpatialAdapter'
import {
  configuredPart1ApiBaseUrl,
  processLivePart1Chapter,
} from './livePart1Api'
import type { Book, Chapter, ChapterProcessingResult, Conflict, ConflictResolution, ProcessingStage, ScenePatch, WorldEntity, WorldSnapshot } from '../types'

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

const liveConflicts = new Map<string, Conflict>()

// GET /api/books
export async function fetchBooks(): Promise<Book[]> {
  await delay(300)
  // A copy, not the live reference — otherwise a later importBook() push into
  // BOOKS silently mutates whatever array App's `books` state already grabbed
  // here, and its own setBooks(prev => [...prev, book]) double-adds the entry.
  return [...BOOKS]
}

// POST /api/books/import
export async function importBook(input: { title: string; chapters: { title: string; content: string }[] }): Promise<Book> {
  await delay(1400)
  if (input.chapters.length === 0 || !input.chapters.some(c => c.content.trim())) {
    throw new Error('Book text is empty.')
  }
  let id = `imported-${input.title.trim().toLowerCase().replace(/\s+/g, '-') || 'story'}`
  if (BOOKS.some(b => b.id === id)) id = `${id}-${Date.now()}`
  const book: Book = {
    id,
    title: input.title.trim() || 'Untitled Story',
    description: 'Imported story',
    chapters: input.chapters.map((chapter, i) => ({
      id: `${id}-ch${i + 1}`, bookId: id, index: i + 1, title: chapter.title, content: chapter.content, processingStatus: 'not_started',
    })),
  }
  // Mirrors a real backend persisting the book. Without this, processChapter
  // can never find it — BOOKS is the mock API's only store, and this import
  // only ever lived in the reader's React state otherwise.
  BOOKS.push(book)
  return book
}

// Arbitrary imported prose has no hand-authored SNAPSHOTS/PATCHES entry, since
// those only cover the three prepared demo books. Falling back to a small
// generic scene (rather than throwing) is what lets "Import Story" actually
// reach the 3D world instead of failing processing every time.
function fallbackSnapshotAndPatch(chapter: Chapter): { snapshot: WorldSnapshot; patch: ScenePatch } {
  const firstSentence = chapter.content.trim().split(/(?<=[.!?])\s+/)[0]?.slice(0, 200)
    || 'A room, freshly imagined from the opening of this story.'
  const entities: WorldEntity[] = [
    {
      id: `${chapter.id}-desk`, name: 'Writing Desk', status: 'added',
      position: { x: 620, y: 480 }, radius: 24, introducedInChapterId: chapter.id,
      currentLocation: 'Center of the room', currentCondition: 'Freshly imagined',
      sourceSentence: firstSentence, evidenceType: 'Visual default',
    },
    {
      id: `${chapter.id}-window`, name: 'Window', status: 'added',
      position: { x: 200, y: 260 }, radius: 20, introducedInChapterId: chapter.id,
      currentLocation: 'North wall', currentCondition: 'Letting in pale light',
      sourceSentence: firstSentence, evidenceType: 'Visual default',
    },
    {
      id: `${chapter.id}-chair`, name: 'Chair', status: 'added',
      position: { x: 560, y: 560 }, radius: 16, introducedInChapterId: chapter.id,
      currentLocation: 'Beside the desk', currentCondition: 'Recently vacated',
      sourceSentence: firstSentence, evidenceType: 'Visual default',
    },
  ]
  return {
    snapshot: { chapterId: chapter.id, entities },
    patch: {
      chapterId: chapter.id,
      addedEntityIds: entities.map(e => e.id),
      movedEntityIds: [], updatedEntityIds: [], removedEntityIds: [],
    },
  }
}

async function beginStage(stage: ProcessingStage, onStage?: (stage: ProcessingStage) => void) {
  onStage?.(stage)
  // Yield once so the reader sees the stage whose real work is about to run.
  await new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

// POST /api/books/{bookId}/chapters/{chapterId}/process
export async function processChapter(
  bookId: string,
  chapterId: string,
  onStage?: (stage: ProcessingStage) => void,
): Promise<ChapterProcessingResult> {
  const book = BOOKS.find(candidate => candidate.id === bookId)
  const chapter = book?.chapters.find(candidate => candidate.id === chapterId)
  if (!book || !chapter) throw new Error(`No story metadata is available for chapter ${chapterId}.`)
  const prepared = SNAPSHOTS[chapterId] && PATCHES[chapterId]
  const liveBaseUrl = configuredPart1ApiBaseUrl()
  if (!prepared && liveBaseUrl) {
    // Deliberately not caught. A configured Member 1 that fails must surface the
    // failure: falling through to fallbackSnapshotAndPatch() below would render a
    // convincing generic room and report success, which is indistinguishable from
    // a working pipeline and has previously masked a stopped API during review.
    try {
      const result = await processLivePart1Chapter(liveBaseUrl, book, chapter, onStage)
      result.conflicts.forEach(conflict => liveConflicts.set(conflict.id, conflict))
      return result
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      throw new Error(
        `Member 1 could not process "${chapter.title}" via ${liveBaseUrl}: ${detail}`,
        { cause },
      )
    }
  }

  // An imported story with no Member 1 configured can only produce the generic
  // placeholder scene. Say so, rather than letting it pass as real extraction.
  if (!prepared) {
    console.warn(
      `[mockApi] "${chapter.title}" is an imported chapter but VITE_STORYWORLD_API_URL `
      + 'is not set. Rendering the built-in placeholder scene (desk, window, chair) — '
      + 'this is NOT Member 1 output.',
    )
  }

  await beginStage('understanding_chapter', onStage)
  const { snapshot, patch } = prepared
    ? { snapshot: SNAPSHOTS[chapterId], patch: PATCHES[chapterId] }
    : fallbackSnapshotAndPatch(chapter)

  await beginStage('matching_entities', onStage)
  const spatial = buildMockSpatialScene(book, chapter, snapshot)

  await beginStage('updating_world', onStage)
  const summary = summaryFromPatch(patch, snapshot)
  const conflicts = CONFLICTS[chapterId] ?? []

  await beginStage('preparing_scene', onStage)
  const sceneRecipe = compileSceneRecipe(spatial.spatialSnapshot, spatial.visualPlan)

  return {
    chapterId,
    snapshot,
    patch,
    ...spatial,
    sceneRecipe,
    summary,
    conflicts,
  }
}

// POST /api/books/{bookId}/chapters/{chapterId}/retry
export async function retryChapterProcessing(
  bookId: string,
  chapterId: string,
  onStage?: (stage: ProcessingStage) => void,
): Promise<ChapterProcessingResult> {
  return processChapter(bookId, chapterId, onStage)
}

// POST /api/conflicts/{conflictId}/resolve
export async function resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<Conflict> {
  await delay(700)
  const conflict = Object.values(CONFLICTS).flat().find(candidate => candidate.id === conflictId)
    ?? liveConflicts.get(conflictId)
  if (!conflict) throw new Error(`Unknown conflict ${conflictId}.`)
  const updated = { ...conflict, activeInterpretation: resolution, status: resolution === 'unresolved' ? 'open' as const : 'resolved' as const }
  if (liveConflicts.has(conflictId)) liveConflicts.set(conflictId, updated)
  return updated
}
