import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api/mockApi'
import WorldViewer from './components/WorldViewer'
import { findEvidencePassage } from './passageLink'
import type {
  AppMode, Book, Chapter, ChapterProcessingResult, ChapterUpdateSummary, Conflict, ConflictResolution,
  EntityInspectionData, EntityStatus, ProcessingStage, UserRole, WorldEntity, WorldSnapshot,
} from './types'
import { PROCESSING_STAGE_LABEL } from './types'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** The chapter a book should open to: its furthest chapter that isn't untouched, or chapter 1. */
function bookEntryPoint(book: Book): Chapter {
  const started = [...book.chapters].reverse().find(c => c.processingStatus !== 'not_started')
  return started ?? book.chapters[0]
}

function chapterLabel(book: Book | null, chapterId: string | null | undefined): string {
  const chapter = book?.chapters.find(c => c.id === chapterId)
  return chapter ? `Chapter ${chapter.index}` : ''
}

function toInspectionData(entity: WorldEntity): EntityInspectionData {
  const history: { chapterId: string; change: string }[] = []
  if (entity.previousLocation) {
    history.push({ chapterId: entity.changedInChapterId ?? '', change: `Previously located: ${entity.previousLocation}` })
  }
  if (entity.previousCondition) {
    history.push({ chapterId: entity.changedInChapterId ?? '', change: `Previous condition: ${entity.previousCondition}` })
  }
  return {
    id: entity.id,
    canonicalName: entity.name,
    entityType: 'Object',
    currentLocation: entity.currentLocation,
    currentCondition: entity.currentCondition,
    introducedInChapterId: entity.introducedInChapterId,
    latestUpdatedChapterId: entity.changedInChapterId,
    currentEvidence: entity.sourceSentence ? {
      sourceSentence: entity.sourceSentence,
      evidenceType: entity.evidenceType ?? 'Explicit',
      startChar: entity.sourceStartChar,
      endChar: entity.sourceEndChar,
    } : undefined,
    history,
  }
}

const STATUS_COLOR: Record<EntityStatus, string> = {
  unchanged: '#6e6354',
  moved: '#4a7cb5',
  updated: '#9b66d4',
  added: '#c9a55a',
  removed: '#c05050',
}

const STATUS_LABEL: Record<EntityStatus, string> = {
  unchanged: 'Unchanged', moved: 'Moved', updated: 'Updated', added: 'New', removed: 'Removed',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EntityStatus }) {
  return (
    <span
      className="font-mono text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider"
      style={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] + '55', background: STATUS_COLOR[status] + '18' }}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function ProcessingPill({ stage }: { stage: ProcessingStage }) {
  if (stage === 'ready' || stage === 'failed') return null
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-full border text-xs font-mono"
      style={{ background: 'rgba(20,18,30,0.9)', borderColor: 'rgba(201,165,90,0.2)', color: '#a89e8e' }}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#c9a55a' }} />
        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#c9a55a' }} />
      </span>
      {PROCESSING_STAGE_LABEL[stage]}
    </div>
  )
}

function ObjectInspector({
  book, entity, onClose, onOpenPassage,
}: {
  book: Book | null
  entity: WorldEntity
  onClose: () => void
  onOpenPassage: (focus: Omit<PassageFocus, 'requestId'>) => void
}) {
  const data = toInspectionData(entity)
  const sourceChapterId = data.latestUpdatedChapterId ?? data.introducedInChapterId
  const sourceChapter = book?.chapters.find(chapter => chapter.id === sourceChapterId)
  return (
    <div className="animate-slide-up absolute bottom-20 left-6 z-30 w-72 rounded-xl border p-5"
      style={{ background: 'rgba(13,11,20,0.97)', borderColor: 'rgba(201,165,90,0.18)', backdropFilter: 'blur(16px)' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-serif text-base font-semibold" style={{ color: '#e0d6c8' }}>{data.canonicalName}</h3>
          <StatusBadge status={entity.status} />
        </div>
        <button onClick={onClose} className="text-lg leading-none opacity-40 hover:opacity-80 transition-opacity" style={{ color: '#e0d6c8' }}>✕</button>
      </div>
      <div className="space-y-3 text-xs" style={{ color: '#a89e8e' }}>
        {book && (
          <div className="rounded-lg border px-3 py-2.5"
            style={{ background: 'rgba(201,165,90,0.06)', borderColor: 'rgba(201,165,90,0.16)' }}>
            <div className="font-mono uppercase tracking-wider text-[10px] mb-1" style={{ color: '#6e6354' }}>From the story</div>
            <div className="font-serif text-sm" style={{ color: '#e0d6c8' }}>{book.title}</div>
            {sourceChapter && (
              <div className="mt-0.5" style={{ color: '#c9a55a' }}>
                Chapter {sourceChapter.index} — {sourceChapter.title}
              </div>
            )}
          </div>
        )}
        {data.currentLocation && (
          <div>
            <div className="font-mono uppercase tracking-wider text-[10px] mb-0.5" style={{ color: '#6e6354' }}>Current location</div>
            <div style={{ color: '#e0d6c8' }}>{data.currentLocation}</div>
          </div>
        )}
        {data.currentCondition && (
          <div>
            <div className="font-mono uppercase tracking-wider text-[10px] mb-0.5" style={{ color: '#6e6354' }}>Condition</div>
            <div style={{ color: '#e0d6c8' }}>{data.currentCondition}</div>
          </div>
        )}
        {data.history?.map((item, i) => (
          <div key={i}>
            <div className="font-mono uppercase tracking-wider text-[10px] mb-0.5" style={{ color: '#6e6354' }}>{item.change.split(':')[0]}</div>
            <div>{item.change.split(': ')[1]}</div>
          </div>
        ))}
        {data.latestUpdatedChapterId && (
          <div>
            <div className="font-mono uppercase tracking-wider text-[10px] mb-0.5" style={{ color: '#6e6354' }}>Changed in</div>
            <div style={{ color: '#e0d6c8' }}>{chapterLabel(book, data.latestUpdatedChapterId)}</div>
          </div>
        )}
        {data.currentEvidence && (
          <>
            <div>
              <div className="font-mono uppercase tracking-wider text-[10px] mb-0.5" style={{ color: '#6e6354' }}>Passage evidence</div>
              <div className="italic leading-relaxed" style={{ color: '#c9b88e' }}>"{data.currentEvidence.sourceSentence}"</div>
              {sourceChapter && (
                <button
                  onClick={() => onOpenPassage({
                    chapterId: sourceChapter.id,
                    sourceSentence: data.currentEvidence!.sourceSentence,
                    startChar: data.currentEvidence!.startChar,
                    endChar: data.currentEvidence!.endChar,
                  })}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all hover:-translate-y-px"
                  style={{
                    background: 'rgba(201,165,90,0.09)',
                    borderColor: 'rgba(201,165,90,0.28)',
                    color: '#d8b86d',
                  }}
                >
                  Read this passage <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
            <div>
              <div className="font-mono uppercase tracking-wider text-[10px] mb-0.5" style={{ color: '#6e6354' }}>Evidence</div>
              <div style={{ color: '#e0d6c8' }}>{data.currentEvidence.evidenceType}</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ChapterDrawer({
  open, book, latestProcessedChapterId, displayedTextChapterId, focusedPassage, onClose, onViewChapter,
}: {
  open: boolean; book: Book; latestProcessedChapterId: string; displayedTextChapterId: string;
  focusedPassage: PassageFocus | null;
  onClose: () => void; onViewChapter: (chapterId: string) => void;
}) {
  const displayed = book.chapters.find(c => c.id === displayedTextChapterId) ?? book.chapters[0]
  const latest = book.chapters.find(c => c.id === latestProcessedChapterId)
  const showingLatest = displayed.id === latestProcessedChapterId
  const prevChapter = book.chapters.find(c => c.index === displayed.index - 1)
  const nextChapter = book.chapters.find(c => c.index === displayed.index + 1)
  const canGoNext = nextChapter && nextChapter.processingStatus === 'ready'
  const passageMatch = focusedPassage?.chapterId === displayed.id
    ? findEvidencePassage(
        displayed.content,
        focusedPassage.sourceSentence,
        focusedPassage.startChar,
        focusedPassage.endChar,
      )
    : null
  const passageRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open || !passageMatch || focusedPassage?.chapterId !== displayed.id) return
    const frame = requestAnimationFrame(() => {
      passageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [displayed.id, focusedPassage?.requestId, open, passageMatch?.start])

  if (!open) return null

  return (
    <div className="animate-slide-in-right absolute top-0 right-0 h-full w-[360px] z-30 flex flex-col border-l"
      style={{ background: 'rgba(11,10,16,0.97)', borderColor: 'rgba(201,165,90,0.12)', backdropFilter: 'blur(20px)' }}>
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
        style={{ borderColor: 'rgba(201,165,90,0.1)' }}>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: '#6e6354' }}>Chapter text</div>
          <div className="font-serif text-sm font-medium" style={{ color: '#e0d6c8' }}>Chapter {displayed.index} — {displayed.title}</div>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full opacity-40 hover:opacity-80 transition-opacity text-sm" style={{ color: '#e0d6c8' }}>✕</button>
      </div>
      {!showingLatest && latest && (
        <div className="mx-5 mt-4 px-3 py-2 rounded-lg text-xs leading-relaxed border"
          style={{ background: 'rgba(201,165,90,0.07)', borderColor: 'rgba(201,165,90,0.2)', color: '#a89e8e' }}>
          You are reading Chapter {displayed.index}. The 3D world reflects Chapter {latest.index}.
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="font-serif text-sm leading-[1.9] whitespace-pre-line" style={{ color: '#d4c9b6' }}>
          {passageMatch ? (
            <>
              {displayed.content.slice(0, passageMatch.start)}
              <mark
                ref={passageRef}
                data-passage-highlight="true"
                className="rounded px-1 py-0.5"
                style={{
                  background: 'linear-gradient(90deg, rgba(201,165,90,0.3), rgba(201,165,90,0.16))',
                  boxShadow: '0 0 0 1px rgba(201,165,90,0.22)',
                  color: '#fff0c7',
                }}
              >
                {displayed.content.slice(passageMatch.start, passageMatch.end)}
              </mark>
              {displayed.content.slice(passageMatch.end)}
            </>
          ) : displayed.content}
        </div>
      </div>
      <div className="flex items-center justify-between px-6 py-4 border-t shrink-0"
        style={{ borderColor: 'rgba(201,165,90,0.1)' }}>
        <button
          onClick={() => prevChapter && onViewChapter(prevChapter.id)}
          disabled={!prevChapter}
          className="text-xs px-3 py-1.5 rounded border transition-all disabled:opacity-25"
          style={{ borderColor: 'rgba(201,165,90,0.2)', color: '#a89e8e' }}>
          ← Previous
        </button>
        <span className="font-mono text-[10px]" style={{ color: '#6e6354' }}>{displayed.index} / {book.chapters.length}</span>
        <button
          onClick={() => canGoNext && nextChapter && onViewChapter(nextChapter.id)}
          disabled={!canGoNext}
          className="text-xs px-3 py-1.5 rounded border transition-all disabled:opacity-25"
          style={{ borderColor: 'rgba(201,165,90,0.2)', color: '#a89e8e' }}>
          Next →
        </button>
      </div>
    </div>
  )
}

function UpdateSummary({
  open, book, chapter, summary, snapshot, onClose, onSelectEntity,
}: {
  open: boolean; book: Book; chapter: Chapter; summary: ChapterUpdateSummary; snapshot: WorldSnapshot;
  onClose: () => void; onSelectEntity: (id: string) => void;
}) {
  if (!open) return null
  const nameOf = (id: string) => snapshot.entities.find(e => e.id === id)?.name ?? id
  const groups: { label: string; ids: string[]; color: string; selectable: boolean }[] = [
    { label: 'Added', ids: summary.addedEntityIds, color: STATUS_COLOR.added, selectable: true },
    { label: 'Moved', ids: summary.movedEntityIds, color: STATUS_COLOR.moved, selectable: true },
    { label: 'Updated', ids: summary.updatedEntityIds, color: STATUS_COLOR.updated, selectable: true },
    { label: 'Removed', ids: summary.removedEntityIds, color: STATUS_COLOR.removed, selectable: true },
    { label: 'Unchanged', ids: summary.unchangedEntityIds, color: STATUS_COLOR.unchanged, selectable: false },
  ]
  return (
    <div className="animate-slide-up absolute top-14 right-6 z-30 w-72 rounded-xl border overflow-hidden"
      style={{ background: 'rgba(13,11,20,0.97)', borderColor: 'rgba(201,165,90,0.18)', backdropFilter: 'blur(16px)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(201,165,90,0.12)' }}>
        <div className="font-serif text-sm font-semibold" style={{ color: '#e0d6c8' }}>Chapter {chapter.index} · Updates</div>
        <button onClick={onClose} className="text-sm opacity-40 hover:opacity-80 transition-opacity" style={{ color: '#e0d6c8' }}>✕</button>
      </div>
      <div className="p-4 space-y-4 text-xs max-h-96 overflow-y-auto">
        {groups.filter(g => g.ids.length > 0).map(group => (
          <div key={group.label}>
            <div className="font-mono uppercase tracking-widest text-[10px] mb-1.5" style={{ color: '#6e6354' }}>{group.label}</div>
            {group.ids.map(id => (
              group.selectable ? (
                <button key={id}
                  onClick={() => { onSelectEntity(id); onClose() }}
                  className="block w-full text-left py-0.5 hover:underline transition-all"
                  style={{ color: group.color }}>
                  • {nameOf(id)}
                </button>
              ) : (
                <div key={id} className="py-0.5" style={{ color: group.color }}>• {nameOf(id)}</div>
              )
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ConflictPanel({
  book, conflict, onResolve, onClose,
}: {
  book: Book; conflict: Conflict; onResolve: (resolution: ConflictResolution) => void; onClose: () => void;
}) {
  const resolved = conflict.status === 'resolved'
  const earlierLabel = chapterLabel(book, conflict.earlierClaim.chapterId)
  const latestLabel = chapterLabel(book, conflict.latestClaim.chapterId)
  return (
    <div className="animate-slide-up absolute inset-x-0 bottom-0 z-40 max-w-2xl mx-auto mb-6 rounded-2xl border overflow-hidden"
      style={{ background: 'rgba(13,11,20,0.98)', borderColor: '#c05050aa', backdropFilter: 'blur(20px)' }}>
      <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'rgba(192,80,80,0.25)' }}>
        <span className="text-base">⚠</span>
        <div className="flex-1">
          <div className="font-serif text-sm font-semibold" style={{ color: '#e0d6c8' }}>Narrative Conflict Detected</div>
          <div className="font-mono text-[10px] mt-0.5" style={{ color: '#c05050' }}>{earlierLabel} vs {latestLabel}</div>
        </div>
        <button onClick={onClose} className="opacity-40 hover:opacity-80 text-sm transition-opacity" style={{ color: '#e0d6c8' }}>✕</button>
      </div>
      <div className="p-6 space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg p-3 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="font-mono uppercase tracking-wider text-[10px] mb-1" style={{ color: '#6e6354' }}>{earlierLabel} statement</div>
            <div style={{ color: '#d4c9b6' }} className="leading-relaxed">{conflict.earlierClaim.statement}</div>
          </div>
          <div className="rounded-lg p-3 border" style={{ background: 'rgba(192,80,80,0.06)', borderColor: 'rgba(192,80,80,0.2)' }}>
            <div className="font-mono uppercase tracking-wider text-[10px] mb-1" style={{ color: '#c05050' }}>{latestLabel} conflict</div>
            <div style={{ color: '#d4c9b6' }} className="leading-relaxed">{conflict.latestClaim.statement}</div>
          </div>
        </div>
        {conflict.confidenceNote && (
          <div className="rounded-lg p-3 border" style={{ background: 'rgba(201,165,90,0.05)', borderColor: 'rgba(201,165,90,0.15)' }}>
            <div className="font-mono uppercase tracking-wider text-[10px] mb-1" style={{ color: '#c9a55a' }}>Reasoning</div>
            <div className="mt-1" style={{ color: '#7a7060' }}>{conflict.confidenceNote}</div>
          </div>
        )}
        {resolved ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: '#c9a55a' }}>
            <span>✓</span> Resolved — {conflict.activeInterpretation === 'earlier' ? `${earlierLabel} interpretation retained` : conflict.activeInterpretation === 'latest' ? `${latestLabel} interpretation accepted` : 'left unresolved'}. Decision logged.
          </div>
        ) : (
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button onClick={() => onResolve('earlier')}
              className="px-4 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90"
              style={{ background: '#c9a55a', color: '#0a0910' }}>
              Retain {earlierLabel} interpretation
            </button>
            <button onClick={() => onResolve('latest')}
              className="px-4 py-2 rounded-lg text-xs border transition-all hover:opacity-80"
              style={{ borderColor: 'rgba(201,165,90,0.3)', color: '#a89e8e' }}>
              Accept {latestLabel}
            </button>
            <button onClick={() => onResolve('unresolved')}
              className="px-4 py-2 rounded-lg text-xs border transition-all hover:opacity-80 ml-auto"
              style={{ borderColor: 'rgba(255,255,255,0.08)', color: '#6e6354' }}>
              Leave unresolved
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function AddBookModal({ onClose, onImport }: { onClose: () => void; onImport: (input: { title: string; text: string }) => Promise<void> }) {
  const [phase, setPhase] = useState<'entry' | 'detecting' | 'preview' | 'importing' | 'success' | 'error'>('entry')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleDetect = () => {
    if (!text.trim()) {
      setError('Please paste some text before detecting chapters.')
      return
    }
    setError(null)
    setPhase('detecting')
    setTimeout(() => setPhase('preview'), 1800)
  }

  const handleConfirm = async () => {
    setPhase('importing')
    try {
      // onImport (App.handleImportBook) closes this modal and navigates to the
      // reader itself once the book is created — this modal only needs to reflect
      // the outcome, not trigger navigation, or the two would race each other.
      await onImport({ title, text })
      setPhase('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
      setPhase('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-xl rounded-2xl border overflow-hidden animate-float-up"
        style={{ background: '#0e0c18', borderColor: 'rgba(201,165,90,0.2)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(201,165,90,0.1)' }}>
          <div className="font-serif text-base font-semibold" style={{ color: '#e0d6c8' }}>Import Your Story</div>
          <button onClick={onClose} className="opacity-40 hover:opacity-80 transition-opacity" style={{ color: '#e0d6c8' }}>✕</button>
        </div>
        <div className="p-6">
          {phase === 'entry' && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest block mb-2" style={{ color: '#6e6354' }}>Book title</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Enter title..."
                  className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-all"
                  style={{ background: '#13111e', borderColor: 'rgba(201,165,90,0.15)', color: '#e0d6c8' }} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest block mb-2" style={{ color: '#6e6354' }}>Paste text</label>
                <textarea value={text} onChange={e => setText(e.target.value)}
                  placeholder="Paste your story here..."
                  rows={7}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-all resize-none"
                  style={{ background: '#13111e', borderColor: 'rgba(201,165,90,0.15)', color: '#e0d6c8' }} />
              </div>
              {error && <div className="text-xs" style={{ color: '#c05050' }}>{error}</div>}
              <div className="flex items-center gap-3 pt-1">
                <button onClick={handleDetect}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                  style={{ background: '#c9a55a', color: '#0a0910' }}>
                  Detect Chapters
                </button>
                <button disabled
                  className="px-4 py-2.5 rounded-lg text-sm border transition-all opacity-40 cursor-not-allowed"
                  style={{ borderColor: 'rgba(201,165,90,0.2)', color: '#a89e8e' }}
                  title="File upload is not wired up in this prototype — paste text instead.">
                  Upload .txt file
                </button>
              </div>
            </div>
          )}
          {phase === 'detecting' && (
            <div className="py-10 flex flex-col items-center gap-4 animate-fade-in">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a55a', borderTopColor: 'transparent' }} />
              </div>
              <div className="font-mono text-xs" style={{ color: '#7a7060' }}>Detecting chapter divisions…</div>
            </div>
          )}
          {phase === 'preview' && (
            <div className="space-y-4 animate-fade-in">
              <div className="rounded-lg border p-4" style={{ background: 'rgba(201,165,90,0.05)', borderColor: 'rgba(201,165,90,0.15)' }}>
                <div className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: '#c9a55a' }}>No chapter headings detected — importing as a single chapter</div>
                <div className="flex items-center gap-3 py-1.5 text-sm" style={{ color: '#d4c9b6' }}>
                  <span className="font-mono text-[10px] w-5 text-right" style={{ color: '#6e6354' }}>1</span>
                  Chapter 1
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleConfirm}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                  style={{ background: '#c9a55a', color: '#0a0910' }}>
                  Confirm & Import
                </button>
                <button onClick={() => setPhase('entry')}
                  className="px-4 py-2.5 rounded-lg text-sm border transition-all hover:opacity-70"
                  style={{ borderColor: 'rgba(201,165,90,0.2)', color: '#a89e8e' }}>
                  Edit text
                </button>
              </div>
            </div>
          )}
          {phase === 'importing' && (
            <div className="py-10 flex flex-col items-center gap-4 animate-fade-in">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a55a', borderTopColor: 'transparent' }} />
              </div>
              <div className="font-mono text-xs" style={{ color: '#7a7060' }}>Creating book records…</div>
            </div>
          )}
          {phase === 'success' && (
            <div className="py-10 flex flex-col items-center gap-3 animate-fade-in">
              <div className="text-3xl">✦</div>
              <div className="font-serif text-base" style={{ color: '#c9a55a' }}>Story imported successfully</div>
              <div className="font-mono text-xs" style={{ color: '#7a7060' }}>Opening reader…</div>
            </div>
          )}
          {phase === 'error' && (
            <div className="py-10 flex flex-col items-center gap-4 animate-fade-in">
              <div className="text-xs text-center" style={{ color: '#c05050' }}>{error ?? 'Something went wrong while importing this book.'}</div>
              <button onClick={() => setPhase('preview')}
                className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                style={{ background: '#c9a55a', color: '#0a0910' }}>
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Library Screen ───────────────────────────────────────────────────────────

function LibraryScreen({
  books, onStart, onAddBook, userRole, onToggleRole,
}: {
  books: Book[]; onStart: (book: Book) => void; onAddBook: () => void;
  userRole: UserRole; onToggleRole: () => void;
}) {
  return (
    <div className="min-h-screen" style={{ background: '#0a0910' }}>
      <header className="border-b px-8 py-5 flex items-center justify-between"
        style={{ borderColor: 'rgba(201,165,90,0.1)', background: 'rgba(10,9,16,0.98)' }}>
        <div className="flex items-center gap-4">
          <div className="w-7 h-7 rounded-full border flex items-center justify-center text-xs"
            style={{ borderColor: '#c9a55a', color: '#c9a55a' }}>✦</div>
          <div>
            <div className="font-serif text-lg font-semibold leading-none" style={{ color: '#e0d6c8' }}>Lorescape</div>
            <div className="font-mono text-[10px] mt-0.5" style={{ color: '#6e6354' }}>Persistent 3D Story Worlds</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="hidden md:block text-xs max-w-xs text-right" style={{ color: '#6e6354' }}>
            Read a chapter. Watch your story become a world.
          </p>
          <button onClick={onToggleRole}
            className="px-3 py-1.5 rounded border text-xs font-mono transition-all"
            style={{
              borderColor: userRole === 'admin' ? '#c9a55a' : 'rgba(201,165,90,0.2)',
              color: userRole === 'admin' ? '#c9a55a' : '#6e6354',
              background: userRole === 'admin' ? 'rgba(201,165,90,0.1)' : 'transparent',
            }}>
            {userRole === 'admin' ? '● Admin' : 'Admin'}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6e6354' }}>Your library</div>
            <h1 className="font-serif text-3xl font-semibold" style={{ color: '#e0d6c8' }}>Prepared Stories</h1>
          </div>
          <button onClick={onAddBook}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-medium transition-all hover:opacity-90"
            style={{ background: '#c9a55a', borderColor: '#c9a55a', color: '#0a0910' }}>
            <span className="text-base leading-none">+</span> Import Story
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {books.map((book, i) => {
            const entry = bookEntryPoint(book)
            const hasStarted = entry.processingStatus !== 'not_started'
            const readCount = book.chapters.filter(c => c.processingStatus === 'ready').length
            return (
              <div key={book.id}
                className="group rounded-2xl border overflow-hidden transition-all duration-300 hover:border-opacity-60"
                style={{
                  background: '#13111e',
                  borderColor: 'rgba(201,165,90,0.12)',
                  animation: `float-up 0.5s ease-out ${i * 0.1}s both`,
                }}>
                <div className="relative h-52 overflow-hidden" style={{ background: '#0e0c18' }}>
                  {book.coverUrl && (
                    <img src={book.coverUrl} alt={book.title}
                      className="w-full h-full object-cover opacity-70 group-hover:opacity-85 transition-opacity duration-500" />
                  )}
                  <div className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, #13111e 0%, transparent 50%)' }} />
                  {hasStarted && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-mono border"
                      style={{ background: 'rgba(201,165,90,0.15)', borderColor: 'rgba(201,165,90,0.3)', color: '#c9a55a' }}>
                      In progress · Ch {entry.index}/{book.chapters.length}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="font-mono text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#6e6354' }}>{book.author}</div>
                  <h2 className="font-serif text-lg font-semibold leading-tight mb-2" style={{ color: '#e0d6c8' }}>{book.title}</h2>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: '#7a7060' }}>{book.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px]" style={{ color: '#4e4640' }}>
                      {book.chapters.length} {book.chapters.length === 1 ? 'chapter' : 'chapters'}
                    </span>
                    <button
                      onClick={() => onStart(book)}
                      className="px-4 py-2 rounded-lg text-xs font-medium border transition-all hover:opacity-90"
                      style={{
                        background: hasStarted ? 'rgba(201,165,90,0.12)' : '#c9a55a',
                        borderColor: '#c9a55a',
                        color: hasStarted ? '#c9a55a' : '#0a0910',
                      }}>
                      {hasStarted ? 'Continue Reading' : 'Start Reading'}
                    </button>
                  </div>
                  {hasStarted && (
                    <div className="mt-3 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(201,165,90,0.1)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(readCount / book.chapters.length) * 100}%`, background: '#c9a55a' }} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 my-12">
          <div className="flex-1 h-px" style={{ background: 'rgba(201,165,90,0.08)' }} />
          <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: '#4e4640' }}>or</div>
          <div className="flex-1 h-px" style={{ background: 'rgba(201,165,90,0.08)' }} />
        </div>

        <button onClick={onAddBook}
          className="w-full rounded-2xl border border-dashed py-10 flex flex-col items-center gap-3 transition-all hover:opacity-80 group"
          style={{ borderColor: 'rgba(201,165,90,0.18)', background: 'rgba(201,165,90,0.03)' }}>
          <div className="w-10 h-10 rounded-full border flex items-center justify-center text-xl group-hover:scale-110 transition-transform"
            style={{ borderColor: 'rgba(201,165,90,0.3)', color: '#c9a55a' }}>+</div>
          <div className="font-serif text-base" style={{ color: '#a89e8e' }}>Upload Your Story</div>
          <div className="font-mono text-[10px]" style={{ color: '#6e6354' }}>Paste text · Auto-detect chapters</div>
        </button>
      </main>
    </div>
  )
}

// ─── Reader Screen ────────────────────────────────────────────────────────────

function ReaderScreen({
  book, chapter, processingStage, processingError, onExplore, onRetry, onBack,
}: {
  book: Book; chapter: Chapter; processingStage: ProcessingStage; processingError: string | null;
  onExplore: () => void; onRetry: () => void; onBack: () => void;
}) {
  const readerRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(false)
  const procFailed = processingStage === 'failed'
  const procDone = processingStage === 'ready'

  const handleScroll = () => {
    const el = readerRef.current
    if (!el) return
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 80)
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: '#0a0910' }}>
      <header className="shrink-0 border-b px-8 py-4 flex items-center gap-6"
        style={{ borderColor: 'rgba(201,165,90,0.1)', background: 'rgba(10,9,16,0.98)' }}>
        <button onClick={onBack}
          className="text-xs border px-3 py-1.5 rounded transition-all hover:opacity-80"
          style={{ borderColor: 'rgba(201,165,90,0.2)', color: '#7a7060' }}>
          ← Library
        </button>
        <div className="flex-1 text-center">
          <div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: '#6e6354' }}>{book.title}</div>
          <div className="font-serif text-sm font-medium" style={{ color: '#e0d6c8' }}>
            Chapter {chapter.index} — {chapter.title}
          </div>
        </div>
        <div className="font-mono text-[10px]" style={{ color: '#6e6354' }}>
          Chapter {chapter.index} of {book.chapters.length}
        </div>
      </header>

      <div className="shrink-0 flex justify-center py-3">
        {procFailed ? (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-mono"
            style={{ background: 'rgba(192,80,80,0.1)', borderColor: 'rgba(192,80,80,0.3)', color: '#c05050' }}>
            <span>✕</span> Scene processing failed
          </div>
        ) : procDone ? (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-mono animate-fade-in"
            style={{ background: 'rgba(201,165,90,0.1)', borderColor: 'rgba(201,165,90,0.3)', color: '#c9a55a' }}>
            <span>✦</span> 3D scene ready
          </div>
        ) : (
          <ProcessingPill stage={processingStage} />
        )}
      </div>

      <div ref={readerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="max-w-[640px] mx-auto px-8 py-8">
          <div className="font-serif text-[11px] uppercase tracking-[0.2em] mb-6" style={{ color: '#6e6354' }}>
            Chapter {chapter.index}
          </div>
          <div className="font-serif text-[17px] leading-[1.85] whitespace-pre-line" style={{ color: '#d4c9b6' }}>
            {chapter.content}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t px-8 py-6 flex items-center justify-center gap-6"
        style={{ borderColor: 'rgba(201,165,90,0.1)', background: 'rgba(10,9,16,0.98)' }}>
        {procFailed ? (
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: '#c05050' }}>
              {processingError ?? 'Scene processing failed.'} Please retry or continue reading.
            </span>
            <button onClick={onRetry}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
              style={{ background: '#c9a55a', color: '#0a0910' }}>
              Retry Loading
            </button>
          </div>
        ) : !procDone ? (
          <div className="flex items-center gap-4">
            {!atBottom && (
              <span className="text-xs" style={{ color: '#6e6354' }}>Scroll to end of chapter</span>
            )}
            <button disabled
              className="px-6 py-2.5 rounded-lg text-sm font-medium opacity-30 cursor-not-allowed border flex items-center gap-2"
              style={{ borderColor: 'rgba(201,165,90,0.3)', color: '#c9a55a' }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#c9a55a' }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#c9a55a' }} />
              </span>
              Preparing the 3D world…
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-6 animate-slide-up">
            <div className="mt-0.5 font-mono text-[10px]" style={{ color: '#6e6354' }}>Scene ready · Chapter {chapter.index}</div>
            <button onClick={onExplore}
              className="px-8 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg"
              style={{ background: '#c9a55a', color: '#0a0910' }}>
              Explore the Scene →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Explorer Screen ──────────────────────────────────────────────────────────

function ExplorerScreen({
  book, chapter, snapshot, summary,
  selectedEntityId, onSelectEntity,
  drawerOpen, onToggleDrawer, displayedTextChapterId, focusedPassage, onViewChapter, onOpenPassage,
  summaryOpen, onToggleSummary,
  userRole, onToggleRole,
  conflicts, adminPanelOpen, onOpenAdminPanel, onCloseAdminPanel, onResolveConflict,
  onBack, onNextChapter, onResetCamera, isFinalChapter,
}: {
  book: Book; chapter: Chapter; snapshot: WorldSnapshot | null; summary: ChapterUpdateSummary | null;
  selectedEntityId: string | null; onSelectEntity: (id: string | null) => void;
  drawerOpen: boolean; onToggleDrawer: () => void; displayedTextChapterId: string; onViewChapter: (id: string) => void;
  focusedPassage: PassageFocus | null; onOpenPassage: (focus: Omit<PassageFocus, 'requestId'>) => void;
  summaryOpen: boolean; onToggleSummary: () => void;
  userRole: UserRole; onToggleRole: () => void;
  conflicts: Conflict[]; adminPanelOpen: boolean; onOpenAdminPanel: () => void; onCloseAdminPanel: () => void;
  onResolveConflict: (conflictId: string, resolution: ConflictResolution) => void;
  onBack: () => void; onNextChapter: () => void; onResetCamera: () => void; isFinalChapter: boolean;
}) {
  const selectedEntity = snapshot?.entities.find(e => e.id === selectedEntityId) ?? null
  const openConflicts = conflicts.filter(c => c.status === 'open')
  const activeConflict = conflicts.find(c => c.status === 'open') ?? conflicts[conflicts.length - 1] ?? null

  return (
    <div className="pointer-events-none relative z-10 h-screen overflow-hidden">

      <div className="pointer-events-auto absolute top-5 left-5 z-20 flex flex-col gap-2">
        <button onClick={onBack}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-mono transition-all hover:opacity-90"
          style={{ background: 'rgba(10,9,16,0.85)', borderColor: 'rgba(201,165,90,0.2)', color: '#a89e8e', backdropFilter: 'blur(12px)' }}>
          ← Reader
        </button>
        <div className="px-3.5 py-2 rounded-xl border text-xs"
          style={{ background: 'rgba(10,9,16,0.75)', borderColor: 'rgba(201,165,90,0.12)', color: '#7a7060', backdropFilter: 'blur(12px)' }}>
          <div className="font-serif text-xs font-medium mb-0.5" style={{ color: '#e0d6c8' }}>{book.title}</div>
          <div className="font-mono text-[10px]">Chapter {chapter.index} · 3D World</div>
        </div>
        <button
          onClick={onResetCamera}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-mono transition-all hover:opacity-80"
          style={{ background: 'rgba(10,9,16,0.7)', borderColor: 'rgba(201,165,90,0.1)', color: '#6e6354', backdropFilter: 'blur(12px)' }}>
          ⊙ Reset camera
        </button>
      </div>

      <div className="pointer-events-auto absolute top-5 right-5 z-20 flex items-start gap-2">
        {userRole === 'admin' && (
          <button onClick={onOpenAdminPanel}
            className="relative flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-mono transition-all hover:opacity-90"
            style={{ background: 'rgba(192,80,80,0.12)', borderColor: 'rgba(192,80,80,0.35)', color: '#c05050', backdropFilter: 'blur(12px)' }}>
            ⚠ Conflicts
            {openConflicts.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold"
                style={{ background: '#c05050', color: 'white' }}>{openConflicts.length}</span>
            )}
          </button>
        )}
        <button onClick={onToggleRole}
          className="px-3 py-2 rounded-xl border text-[10px] font-mono transition-all"
          style={{
            background: userRole === 'admin' ? 'rgba(201,165,90,0.12)' : 'rgba(10,9,16,0.75)',
            borderColor: userRole === 'admin' ? 'rgba(201,165,90,0.4)' : 'rgba(201,165,90,0.12)',
            color: userRole === 'admin' ? '#c9a55a' : '#6e6354',
            backdropFilter: 'blur(12px)',
          }}>
          {userRole === 'admin' ? '● Admin' : 'Admin'}
        </button>
        {summary && (
          <button onClick={onToggleSummary}
            className="relative flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-mono transition-all hover:opacity-90"
            style={{ background: 'rgba(10,9,16,0.85)', borderColor: 'rgba(201,165,90,0.2)', color: '#c9a55a', backdropFilter: 'blur(12px)' }}>
            ✦ Chapter Updates · {summary.addedEntityIds.length + summary.movedEntityIds.length + summary.updatedEntityIds.length + summary.removedEntityIds.length}
          </button>
        )}
      </div>

      {summaryOpen && summary && snapshot && (
        <div className="pointer-events-auto">
          <UpdateSummary
            open={summaryOpen}
            book={book}
            chapter={chapter}
            summary={summary}
            snapshot={snapshot}
            onClose={onToggleSummary}
            onSelectEntity={id => onSelectEntity(id)}
          />
        </div>
      )}

      {selectedEntity && (
        <div className="pointer-events-auto">
          <ObjectInspector
            book={book}
            entity={selectedEntity}
            onClose={() => onSelectEntity(null)}
            onOpenPassage={onOpenPassage}
          />
        </div>
      )}

      {!drawerOpen && (
        <button onClick={onToggleDrawer}
          className="pointer-events-auto absolute top-1/2 -translate-y-1/2 right-0 z-20 flex items-center gap-2 pl-3 pr-2 py-3 rounded-l-xl border border-r-0 text-xs font-mono transition-all hover:opacity-90"
          style={{ background: 'rgba(10,9,16,0.85)', borderColor: 'rgba(201,165,90,0.2)', color: '#a89e8e', backdropFilter: 'blur(12px)', writingMode: 'vertical-rl' }}>
          View Chapter
        </button>
      )}

      <div className="pointer-events-auto">
        <ChapterDrawer
          open={drawerOpen}
          book={book}
          latestProcessedChapterId={chapter.id}
          displayedTextChapterId={displayedTextChapterId}
          focusedPassage={focusedPassage}
          onClose={onToggleDrawer}
          onViewChapter={onViewChapter}
        />
      </div>

      {adminPanelOpen && userRole === 'admin' && activeConflict && (
        <div className="pointer-events-auto">
          <ConflictPanel
            book={book}
            conflict={activeConflict}
            onResolve={resolution => onResolveConflict(activeConflict.id, resolution)}
            onClose={onCloseAdminPanel}
          />
        </div>
      )}

      <div className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4">
        <div className="flex items-center gap-3 px-6 py-3 rounded-2xl border"
          style={{ background: 'rgba(10,9,16,0.9)', borderColor: 'rgba(201,165,90,0.15)', backdropFilter: 'blur(16px)' }}>
          <span className="text-xs" style={{ color: '#6e6354' }}>World locked to Ch {chapter.index}</span>
          <div className="w-px h-4" style={{ background: 'rgba(201,165,90,0.15)' }} />
          <button onClick={onNextChapter}
            className="px-5 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
            style={{ background: '#c9a55a', color: '#0a0910' }}>
            {isFinalChapter ? 'Finish Exploration' : `Proceed to Chapter ${chapter.index + 1} →`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────

function PreparedWorldSurface({
  result,
  visible,
  resetToken,
  selectedEntityId,
  highlightedEntityIds,
  onEntitySelect,
  onReady,
  onError,
  onPassageAdvance,
}: {
  result: ChapterProcessingResult
  visible: boolean
  resetToken: number
  selectedEntityId: string | null
  highlightedEntityIds: string[]
  onEntitySelect: (id: string | null) => void
  onReady: (result: ChapterProcessingResult) => void
  onError: (result: ChapterProcessingResult, message: string) => void
  onPassageAdvance?: () => void
}) {
  const locationIds = result.spatialSnapshot.locations.map(location => location.id)
  const [locationIndex, setLocationIndex] = useState(0)
  const [warmupComplete, setWarmupComplete] = useState(false)
  const warmedLocations = useRef(new Set<string>())
  const pendingWarmupAdvance = useRef<number | null>(null)
  const activeLocationId = locationIds[locationIndex] ?? locationIds[0] ?? ''

  useEffect(() => {
    if (pendingWarmupAdvance.current !== null) {
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(pendingWarmupAdvance.current)
      else window.clearTimeout(pendingWarmupAdvance.current)
      pendingWarmupAdvance.current = null
    }
    warmedLocations.current.clear()
    setLocationIndex(0)
    setWarmupComplete(false)
  }, [result.chapterId])

  useEffect(() => () => {
    if (pendingWarmupAdvance.current === null) return
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(pendingWarmupAdvance.current)
    else window.clearTimeout(pendingWarmupAdvance.current)
  }, [])

  const handleLocationReady = useCallback(() => {
    if (warmupComplete) return
    if (!activeLocationId || warmedLocations.current.has(activeLocationId)) return
    warmedLocations.current.add(activeLocationId)
    if (locationIndex < locationIds.length - 1) {
      const advance = () => {
        pendingWarmupAdvance.current = null
        setLocationIndex(index => index + 1)
      }
      pendingWarmupAdvance.current = 'requestIdleCallback' in window
        ? window.requestIdleCallback(advance, { timeout: 900 })
        : window.setTimeout(advance, 80)
    }
    else {
      setWarmupComplete(true)
      onReady(result)
    }
  }, [activeLocationId, locationIds.length, locationIndex, onReady, result, warmupComplete])

  return (
    <div
      aria-hidden={!visible}
      data-scene-warmup={result.chapterId}
      data-warmup-location={activeLocationId}
      data-warmup-complete={warmupComplete}
      style={visible
        ? { position: 'fixed', inset: 0, zIndex: 0, opacity: 1, pointerEvents: 'auto', overflow: 'hidden' }
        : { position: 'fixed', left: -10000, top: 0, width: 96, height: 96, opacity: 0.001, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <WorldViewer
        resetToken={resetToken}
        renderMode={visible ? 'continuous' : 'on-demand'}
        snapshot={result.spatialSnapshot}
        patch={result.spatialPatch}
        visualPlan={result.visualPlan}
        sceneRecipe={result.sceneRecipe}
        activeLocationId={warmupComplete ? undefined : activeLocationId}
        selectedEntityId={selectedEntityId}
        highlightedEntityIds={highlightedEntityIds}
        showChapterChanges={visible}
        onEntitySelect={onEntitySelect}
        onSceneReady={handleLocationReady}
        onSceneError={message => onError(result, message)}
        onPassageAdvance={onPassageAdvance}
      />
    </div>
  )
}

interface PassageFocus {
  chapterId: string
  sourceSentence: string
  startChar?: number
  endChar?: number
  requestId: number
}

export default function App() {
  const [books, setBooks] = useState<Book[]>([])
  const [chapterResults, setChapterResults] = useState<Record<string, ChapterProcessingResult>>({})

  const [appMode, setAppMode] = useState<AppMode>('library')
  const [activeBookId, setActiveBookId] = useState<string | null>(null)
  const [readerChapterId, setReaderChapterId] = useState<string | null>(null)
  const [latestProcessedChapterId, setLatestProcessedChapterId] = useState<string | null>(null)
  const [displayedTextChapterId, setDisplayedTextChapterId] = useState<string | null>(null)

  const [activeSnapshot, setActiveSnapshot] = useState<WorldSnapshot | null>(null)
  const [activeSummary, setActiveSummary] = useState<ChapterUpdateSummary | null>(null)

  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle')
  const [processingError, setProcessingError] = useState<string | null>(null)

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [focusedPassage, setFocusedPassage] = useState<PassageFocus | null>(null)
  const [highlightedEntityIds] = useState<string[]>([])
  const [viewerResetToken, setViewerResetToken] = useState(0)

  const [chapterDrawerOpen, setChapterDrawerOpen] = useState(false)
  const [updateSummaryOpen, setUpdateSummaryOpen] = useState(false)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)

  const [userRole, setUserRole] = useState<UserRole>('reader')
  const [conflicts, setConflicts] = useState<Conflict[]>([])

  const [importOpen, setImportOpen] = useState(false)

  const processingTrackRef = useRef<string | null>(null)

  useEffect(() => {
    api.fetchBooks().then(setBooks)
  }, [])

  const activeBook = books.find(b => b.id === activeBookId) ?? null
  const readerChapter = activeBook?.chapters.find(c => c.id === readerChapterId) ?? null
  const latestProcessedChapter = activeBook?.chapters.find(c => c.id === latestProcessedChapterId) ?? null

  const triggerProcessing = useCallback((bookId: string, chapterId: string) => {
    if (processingTrackRef.current === chapterId) return // prevent duplicate processing requests (PRD §5)
    processingTrackRef.current = chapterId

    setProcessingStage('idle')
    setProcessingError(null)
    setBooks(prev => prev.map(b => b.id !== bookId ? b : {
      ...b, chapters: b.chapters.map(c => c.id === chapterId ? { ...c, processingStatus: 'processing' } : c),
    }))

    api.processChapter(bookId, chapterId, stage => setProcessingStage(stage))
      .then(result => {
        processingTrackRef.current = null
        setChapterResults(prev => ({ ...prev, [chapterId]: result }))
        setActiveSnapshot(result.snapshot)
        setActiveSummary(result.summary)
        setConflicts(prev => {
          const incomingIds = new Set(result.conflicts.map(c => c.id))
          return [...prev.filter(c => !incomingIds.has(c.id)), ...result.conflicts]
        })
        // Compilation is complete. A hidden renderer now loads every location
        // before the reader is allowed to enter the world.
        setProcessingStage('preparing_scene')
      })
      .catch((err: unknown) => {
        processingTrackRef.current = null
        setBooks(prev => prev.map(b => b.id !== bookId ? b : {
          ...b, chapters: b.chapters.map(c => c.id === chapterId ? { ...c, processingStatus: 'failed' } : c),
        }))
        // PRD §12: preserve the previous world snapshot/patch/summary on failure.
        setProcessingStage('failed')
        setProcessingError(err instanceof Error ? err.message : 'Scene processing failed.')
      })
  }, [])

  const finishScenePreparation = useCallback((result: ChapterProcessingResult) => {
    setBooks(prev => prev.map(book => !book.chapters.some(chapter => chapter.id === result.chapterId) ? book : {
      ...book,
      chapters: book.chapters.map(chapter => chapter.id === result.chapterId
        ? { ...chapter, processingStatus: 'ready' }
        : chapter),
    }))
    setActiveSnapshot(result.snapshot)
    setActiveSummary(result.summary)
    setLatestProcessedChapterId(result.chapterId)
    setProcessingStage('ready')
    setProcessingError(null)
  }, [])

  const failScenePreparation = useCallback((result: ChapterProcessingResult, message: string) => {
    setBooks(prev => prev.map(book => !book.chapters.some(chapter => chapter.id === result.chapterId) ? book : {
      ...book,
      chapters: book.chapters.map(chapter => chapter.id === result.chapterId
        ? { ...chapter, processingStatus: 'failed' }
        : chapter),
    }))
    setProcessingStage('failed')
    setProcessingError(message)
  }, [])

  const startReading = (book: Book) => {
    const entry = bookEntryPoint(book)
    setActiveBookId(book.id)
    setReaderChapterId(entry.id)
    setDisplayedTextChapterId(entry.id)
    setSelectedEntityId(null)
    setFocusedPassage(null)
    setChapterDrawerOpen(false)
    setUpdateSummaryOpen(false)
    setAppMode('reading')

    const cached = chapterResults[entry.id]
    if (cached && entry.processingStatus === 'ready') {
      setLatestProcessedChapterId(entry.id)
      setActiveSnapshot(cached.snapshot)
      setActiveSummary(cached.summary)
      setProcessingStage('ready')
    } else if (cached) {
      setProcessingStage('preparing_scene')
    } else if (entry.processingStatus === 'not_started' || entry.processingStatus === 'failed') {
      setLatestProcessedChapterId(null)
      setActiveSnapshot(null)
      setActiveSummary(null)
      triggerProcessing(book.id, entry.id)
    }
    // else: a request for this chapter is already in flight — let it resolve in place.
  }

  const openExplore = () => {
    setSelectedEntityId(null)
    setAppMode('exploring')
  }

  const proceedToNextChapter = () => {
    if (!activeBook || !latestProcessedChapterId) return
    const currentIndex = activeBook.chapters.findIndex(c => c.id === latestProcessedChapterId)
    const next = activeBook.chapters[currentIndex + 1]
    if (!next) {
      // Final chapter reached — PRD §8 / design brief §5 completion state.
      setAppMode('library')
      setActiveBookId(null)
      setReaderChapterId(null)
      return
    }
    setReaderChapterId(next.id)
    setDisplayedTextChapterId(next.id)
    setSelectedEntityId(null)
    setFocusedPassage(null)
    setChapterDrawerOpen(false)
    setUpdateSummaryOpen(false)
    setAppMode('reading')
    // Retain the existing world snapshot/patch until the next chapter's result arrives.
    if (next.processingStatus === 'not_started' || next.processingStatus === 'failed') {
      triggerProcessing(activeBook.id, next.id)
    }
  }

  const handleImportBook = async ({ title, text }: { title: string; text: string }) => {
    setAppMode('importing_book')
    const book = await api.importBook({ title, text })
    setBooks(prev => [...prev, book])
    // Brief pause so the modal's "imported successfully" beat is visible before navigating away.
    await new Promise(resolve => setTimeout(resolve, 700))
    setImportOpen(false)
    startReading(book)
  }

  const handleResolveConflict = async (conflictId: string, resolution: ConflictResolution) => {
    const updated = await api.resolveConflict(conflictId, resolution)
    setConflicts(prev => prev.map(c => (c.id === conflictId ? updated : c)))
  }

  if (appMode === 'library' || appMode === 'importing_book') {
    return (
      <>
        <LibraryScreen
          books={books}
          onStart={startReading}
          onAddBook={() => setImportOpen(true)}
          userRole={userRole}
          onToggleRole={() => setUserRole(r => (r === 'reader' ? 'admin' : 'reader'))}
        />
        {importOpen && (
          <AddBookModal
            onClose={() => { setImportOpen(false); setAppMode('library') }}
            onImport={handleImportBook}
          />
        )}
      </>
    )
  }

  if (appMode === 'reading' && activeBook && readerChapter) {
    const preparedResult = chapterResults[readerChapter.id] ?? null
    return (
      <>
        {preparedResult && (
          <PreparedWorldSurface
            key={`prepared-world:${readerChapter.id}`}
            result={preparedResult}
            visible={false}
            resetToken={viewerResetToken}
            selectedEntityId={selectedEntityId}
            highlightedEntityIds={highlightedEntityIds}
            onEntitySelect={setSelectedEntityId}
            onReady={finishScenePreparation}
            onError={failScenePreparation}
          />
        )}
        <ReaderScreen
          book={activeBook}
          chapter={readerChapter}
          processingStage={readerChapter.id === latestProcessedChapterId ? 'ready' : processingStage}
          processingError={processingError}
          onExplore={openExplore}
          onRetry={() => triggerProcessing(activeBook.id, readerChapter.id)}
          onBack={() => setAppMode('library')}
        />
      </>
    )
  }

  if ((appMode === 'exploring' || appMode === 'admin_review') && activeBook && latestProcessedChapter && displayedTextChapterId) {
    const isFinalChapter = activeBook.chapters.findIndex(c => c.id === latestProcessedChapterId) === activeBook.chapters.length - 1
    const activeSpatialScene = chapterResults[latestProcessedChapter.id] ?? null
    return (
      <>
        {activeSpatialScene && (
          <PreparedWorldSurface
            key={`prepared-world:${latestProcessedChapter.id}`}
            result={activeSpatialScene}
            visible
            resetToken={viewerResetToken}
            selectedEntityId={selectedEntityId}
            highlightedEntityIds={highlightedEntityIds}
            onEntitySelect={setSelectedEntityId}
            onReady={finishScenePreparation}
            onError={failScenePreparation}
            onPassageAdvance={isFinalChapter ? undefined : proceedToNextChapter}
          />
        )}
        <ExplorerScreen
          book={activeBook}
          chapter={latestProcessedChapter}
          snapshot={activeSnapshot}
          summary={activeSummary}
          selectedEntityId={selectedEntityId}
          onSelectEntity={setSelectedEntityId}
          drawerOpen={chapterDrawerOpen}
          onToggleDrawer={() => setChapterDrawerOpen(d => !d)}
          displayedTextChapterId={displayedTextChapterId}
          focusedPassage={focusedPassage}
          onViewChapter={chapterId => {
            setDisplayedTextChapterId(chapterId)
            setFocusedPassage(null)
          }}
          onOpenPassage={focus => {
            setDisplayedTextChapterId(focus.chapterId)
            setFocusedPassage({ ...focus, requestId: Date.now() })
            setChapterDrawerOpen(true)
          }}
          summaryOpen={updateSummaryOpen}
          onToggleSummary={() => setUpdateSummaryOpen(s => !s)}
          userRole={userRole}
          onToggleRole={() => setUserRole(r => (r === 'reader' ? 'admin' : 'reader'))}
          conflicts={conflicts}
          adminPanelOpen={adminPanelOpen}
          onOpenAdminPanel={() => { setAdminPanelOpen(true); setAppMode('admin_review') }}
          onCloseAdminPanel={() => { setAdminPanelOpen(false); setAppMode('exploring') }}
          onResolveConflict={handleResolveConflict}
          onBack={() => setAppMode('reading')}
          onNextChapter={proceedToNextChapter}
          onResetCamera={() => setViewerResetToken(token => token + 1)}
          isFinalChapter={isFinalChapter}
        />
      </>
    )
  }

  // Books still loading, or state hasn't settled into a renderable combination yet.
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0910', color: '#6e6354' }}>
      <div className="font-mono text-xs">Loading…</div>
    </div>
  )
}
