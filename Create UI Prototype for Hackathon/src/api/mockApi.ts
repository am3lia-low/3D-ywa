// Thin adapter over the backend contract described in the PRD (§14 Minimum Backend
// Interfaces). Every function here corresponds to one endpoint and returns exactly
// the shape that endpoint promises. Nothing outside this file knows the data is
// coming from local mock state and setTimeout instead of a network request —
// swapping these bodies for real fetch() calls once the schema is aligned with
// Member 1's backend should not require touching any component.

import { BOOKS, CONFLICTS, PATCHES, SNAPSHOTS, summaryFromPatch } from '../data/mockData'
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
      // No chapter-heading detection in this prototype: the whole submission
      // becomes one chapter, per PRD §4's documented fallback behaviour.
      { id: `${id}-ch1`, bookId: id, index: 1, title: 'Chapter 1', content: input.text, processingStatus: 'not_started' },
    ],
  }
}

const STAGE_SEQUENCE: ProcessingStage[] = ['understanding_chapter', 'matching_entities', 'updating_world', 'preparing_scene']
const STAGE_DELAYS_MS = [900, 1500, 1700, 1500]

const attemptsByChapterId = new Map<string, number>()

// POST /api/books/{bookId}/chapters/{chapterId}/process
// (also used for retry — see retryChapterProcessing below)
export async function processChapter(
  bookId: string,
  chapterId: string,
  onStage?: (stage: ProcessingStage) => void,
): Promise<ChapterProcessingResult> {
  const attempt = (attemptsByChapterId.get(chapterId) ?? 0) + 1
  attemptsByChapterId.set(chapterId, attempt)

  for (let i = 0; i < STAGE_SEQUENCE.length; i++) {
    await delay(STAGE_DELAYS_MS[i])
    onStage?.(STAGE_SEQUENCE[i])
  }
  await delay(500)

  // Demo hook: the first processing attempt on Ashwood chapter 2 simulates a
  // transient backend failure, so the failure / Retry Loading UI (PRD §12) has
  // a real path that exercises it instead of being permanently dead code.
  if (chapterId === 'ashwood-ch2' && attempt === 1) {
    throw new Error('The narrative-processing service timed out while resolving spatial relationships.')
  }

  const snapshot = SNAPSHOTS[chapterId]
  const patch = PATCHES[chapterId]
  if (!snapshot || !patch) throw new Error(`No processing result is available for chapter ${chapterId}.`)

  return {
    chapterId,
    snapshot,
    patch,
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
  const conflict = Object.values(CONFLICTS).flat().find(c => c.id === conflictId)
  if (!conflict) throw new Error(`Unknown conflict ${conflictId}.`)
  return { ...conflict, activeInterpretation: resolution, status: resolution === 'unresolved' ? 'open' : 'resolved' }
}
