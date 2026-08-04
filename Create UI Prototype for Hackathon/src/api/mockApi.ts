// Thin adapter over the backend contract described in the PRD. Components do
// not need to know that this development build uses local mock state and delay.

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

const STAGE_SEQUENCE: ProcessingStage[] = ['understanding_chapter', 'matching_entities', 'updating_world', 'preparing_scene']
const STAGE_DELAYS_MS = [900, 1500, 1700, 1500]

// POST /api/books/{bookId}/chapters/{chapterId}/process
export async function processChapter(
  bookId: string,
  chapterId: string,
  onStage?: (stage: ProcessingStage) => void,
): Promise<ChapterProcessingResult> {
  for (let i = 0; i < STAGE_SEQUENCE.length; i++) {
    await delay(STAGE_DELAYS_MS[i])
    onStage?.(STAGE_SEQUENCE[i])
  }
  await delay(500)

  const snapshot = SNAPSHOTS[chapterId]
  const patch = PATCHES[chapterId]
  if (!snapshot || !patch) throw new Error(`No processing result is available for chapter ${chapterId}.`)
  const book = BOOKS.find(candidate => candidate.id === bookId)
  const chapter = book?.chapters.find(candidate => candidate.id === chapterId)
  if (!book || !chapter) throw new Error(`No story metadata is available for chapter ${chapterId}.`)
  const spatial = buildMockSpatialScene(book, chapter, snapshot)

  return {
    chapterId,
    snapshot,
    patch,
    ...spatial,
    summary: summaryFromPatch(patch, snapshot),
    conflicts: CONFLICTS[chapterId] ?? [],
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
