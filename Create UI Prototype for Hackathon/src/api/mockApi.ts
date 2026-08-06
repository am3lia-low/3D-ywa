// Thin adapter over the backend contract described in the PRD. Components do
// not need to know that this development build uses local mock state.

import { compileSceneRecipe } from '@spatial-runtime'
import { BOOKS, CONFLICTS, PATCHES, SNAPSHOTS, summaryFromPatch } from '../data/mockData'
import { buildMockSpatialScene } from '../spatial/mockSpatialAdapter'
import type { Book, ChapterProcessingResult, Conflict, ConflictResolution, ProcessingStage } from '../types'

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

// GET /api/books
export async function fetchBooks(): Promise<Book[]> {
  await delay(300)
  return BOOKS
}

// POST /api/books/import
export async function importBook(input: { title: string; text: string }): Promise<Book> {
  await delay(1400)
  if (!input.text.trim()) throw new Error('Book text is empty.')
  const id = `imported-${input.title.trim().toLowerCase().replace(/\s+/g, '-') || 'story'}`
  return {
    id,
    title: input.title.trim() || 'Untitled Story',
    description: 'Imported story',
    chapters: [
      // Until chapter-heading detection is connected, one import is one chapter.
      { id: `${id}-ch1`, bookId: id, index: 1, title: 'Chapter 1', content: input.text, processingStatus: 'not_started' },
    ],
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
  await beginStage('understanding_chapter', onStage)
  const snapshot = SNAPSHOTS[chapterId]
  const patch = PATCHES[chapterId]
  if (!snapshot || !patch) throw new Error(`No processing result is available for chapter ${chapterId}.`)
  const book = BOOKS.find(candidate => candidate.id === bookId)
  const chapter = book?.chapters.find(candidate => candidate.id === chapterId)
  if (!book || !chapter) throw new Error(`No story metadata is available for chapter ${chapterId}.`)

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
  if (!conflict) throw new Error(`Unknown conflict ${conflictId}.`)
  return { ...conflict, activeInterpretation: resolution, status: resolution === 'unresolved' ? 'open' : 'resolved' }
}
