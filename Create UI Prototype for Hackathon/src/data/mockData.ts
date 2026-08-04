import type { Book, ChapterUpdateSummary, Conflict, ScenePatch, WorldEntity, WorldSnapshot } from '../types'

// ─── Chapter prose ───────────────────────────────────────────────────────────

const ASHWOOD_CH1_TEXT = `The carriage had been climbing for an hour before Lydia Ashworth first saw the house — or rather, the idea of a house, a silhouette pressed against a sky that had not quite committed to night.

She pressed her face against the cold glass. The building resolved itself: tall, older than it looked, with windows that caught no light despite the candles she could see moving behind them. A housekeeper with a lamp. A groom crossing the courtyard. Someone drawing curtains on the first floor.

She had been told that Ashwood was a working estate. The letter from her employer had been precise: eight rooms occupied, three in disuse, a library of some note, and a child, Thomas, age nine, who had not spoken since his mother's accident eighteen months prior.

The carriage door opened before she had settled her bag. The housekeeper — Mrs. Pale, she would learn — stood with the lamp extended and said nothing.

"I am Miss Ashworth," Lydia said. "I am the new governess."

Mrs. Pale nodded and turned without greeting her.

The front hall smelled of beeswax and something older, something that reminded Lydia of churches: not incense exactly, but the weight of accumulated silence. A fireplace dominated the north wall, cold now, its mantelpiece bearing a row of framed photographs and a single brass clock that had stopped at twenty past four.

Above the fireplace hung a portrait she did not recognise — a woman in a dark dress, seated, her hands arranged too carefully in her lap. The eyes followed, as portraits in such places always did.

To her right was a desk — heavy oak, leather-topped, stacked with correspondence that appeared to be several weeks old. To her left, a door, ajar, through which she could see part of a staircase. A red armchair stood beside the fireplace, angled toward the room rather than the hearth, as if its last occupant had been expecting a visitor who had not come.

The bay window on the north wall let in what little moonlight remained. Mrs. Pale was already at the staircase.

Lydia took one more look at the hall — committing it to memory, as she always did with rooms — and followed.`

const ASHWOOD_CH2_TEXT = `Thomas was not in his room when she went to find him the next morning.

This ought to have alarmed her more than it did. But the house had spent the night adjusting her expectations. She had heard footsteps between one and three. She had found, on waking, that her window, which she was certain she had latched, stood slightly open.

She found him in the hall.

He had pulled the red armchair from its position beside the fireplace and dragged it — with some effort, judging by the marks on the floor — to face the bay window on the north wall. He was sitting in it, still in his nightclothes, watching the drive.

She sat on the floor beside him without speaking. This, her training suggested, was sometimes the correct approach.

After several minutes, Thomas said: "She used to sit here in the mornings."

Lydia waited.

"She liked the light," he added. "In winter there was more light from the window than from the fire."

The portrait above the fireplace, she noticed then for the first time, was hanging slightly crooked — tilted perhaps three degrees to the right. She was almost certain it had been straight the evening before. She said nothing about it.

That afternoon she discovered that the door at the east end of the hall — which she had taken for a cupboard — was locked. Not with a key but with a bolt that had been painted over so many times it had effectively become part of the wall. The paint was new. Or rather: the final coat was new. Someone had re-bolted it recently.

She asked Mrs. Pale about it at supper.

Mrs. Pale looked at her plate. "Storage," she said.

"I see," said Lydia.

Neither of them spoke again until the clock — which, she had by now confirmed, remained stopped at twenty past four — seemed to mark the silence.`

const MERIDIAN_CH1_TEXT = `Elin had drawn the Vessant quarter four times now, and four times the canal had been in a different place.

She told herself, the first time, that she had simply misremembered. The second time, that the light had confused her. By the fourth, standing at the corner where a bridge should have been and finding instead a flight of stone steps descending into a wine merchant's cellar, she had stopped telling herself anything at all.

She sat on a low wall and opened her instruments. The city, she had begun to suspect, was not lying to her. It was simply not finished arranging itself — and it did not care to be caught in the act.`

const AMBER_CH1_TEXT = `The third shelf in the east gallery held nothing according to the ledger, and everything according to Marguerite's fingers, which found the amber pendant exactly where her hands remembered leaving it forty years before she was born.

She did not mention this to Corvin. Not yet. Some things, catalogued too early, stopped being true.`

// ─── World entities ──────────────────────────────────────────────────────────
// Position/radius are SVG-space coordinates consumed by the mock WorldViewer's
// room renderer. A real 3D viewer would ignore these in favour of true 3D
// transforms, but would consume the rest of this shape unchanged.

const ASHWOOD_ENTITIES_CH1: WorldEntity[] = [
  {
    id: 'fireplace', name: 'Fireplace', status: 'unchanged',
    position: { x: 600, y: 390 }, radius: 28,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: 'North wall, centre', currentCondition: 'Cold, unlit',
    sourceSentence: 'A fireplace dominated the north wall, cold now, its mantelpiece bearing a row of framed photographs.',
    evidenceType: 'Explicit',
  },
  {
    id: 'armchair', name: 'Red Armchair', status: 'unchanged',
    position: { x: 555, y: 470 }, radius: 22,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: 'Beside the fireplace', currentCondition: 'Angled toward the room',
    sourceSentence: 'A red armchair stood beside the fireplace, angled toward the room rather than the hearth.',
    evidenceType: 'Explicit',
  },
  {
    id: 'desk', name: 'Writing Desk', status: 'unchanged',
    position: { x: 700, y: 565 }, radius: 26,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: 'Right side of hall', currentCondition: 'Stacked with old correspondence',
    sourceSentence: 'To her right was a desk — heavy oak, leather-topped...',
    evidenceType: 'Explicit',
  },
  {
    id: 'portrait', name: 'Portrait', status: 'unchanged',
    position: { x: 682, y: 182 }, radius: 18,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: 'Above the fireplace', currentCondition: 'Straight',
    sourceSentence: 'Above the fireplace hung a portrait she did not recognise.',
    evidenceType: 'Explicit',
  },
  {
    id: 'window', name: 'Bay Window', status: 'unchanged',
    position: { x: 90, y: 300 }, radius: 20,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: 'North wall, left', currentCondition: 'Latched',
    sourceSentence: 'The bay window on the north wall let in what little moonlight remained.',
    evidenceType: 'Explicit',
  },
  {
    id: 'door', name: 'Main Door', status: 'unchanged',
    position: { x: 1062, y: 300 }, radius: 20,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: 'West entrance', currentCondition: 'Locked at night',
    sourceSentence: 'The carriage door opened before she had settled her bag.',
    evidenceType: 'Inferred',
  },
]

const ASHWOOD_ENTITIES_CH2: WorldEntity[] = [
  {
    ...ASHWOOD_ENTITIES_CH1[0], // fireplace — unchanged
  },
  {
    id: 'armchair', name: 'Red Armchair', status: 'moved',
    position: { x: 130, y: 340 }, radius: 22,
    introducedInChapterId: 'ashwood-ch1', changedInChapterId: 'ashwood-ch2',
    currentLocation: 'Beside the bay window', previousLocation: 'Beside the fireplace',
    currentCondition: 'Occupied',
    sourceSentence: 'He had pulled the red armchair towards the window.',
    evidenceType: 'Explicit',
  },
  { ...ASHWOOD_ENTITIES_CH1[2] }, // desk — unchanged
  {
    id: 'portrait', name: 'Portrait', status: 'updated',
    position: { x: 682, y: 182 }, radius: 18,
    introducedInChapterId: 'ashwood-ch1', changedInChapterId: 'ashwood-ch2',
    currentLocation: 'Above the fireplace', currentCondition: 'Tilted ~3° right', previousCondition: 'Straight',
    sourceSentence: '...was hanging slightly crooked — tilted perhaps three degrees to the right.',
    evidenceType: 'Explicit',
  },
  { ...ASHWOOD_ENTITIES_CH1[4] }, // window — unchanged
  { ...ASHWOOD_ENTITIES_CH1[5] }, // door — unchanged
  {
    id: 'doorway', name: 'Hidden Doorway', status: 'added',
    position: { x: 920, y: 432 }, radius: 20,
    introducedInChapterId: 'ashwood-ch2',
    currentLocation: 'East end of hall', currentCondition: 'Sealed with painted-over bolt',
    sourceSentence: '...the door at the east end of the hall — which she had taken for a cupboard — was locked.',
    evidenceType: 'Explicit',
  },
  {
    id: 'key', name: 'Silver Key', status: 'added',
    position: { x: 670, y: 598 }, radius: 12,
    introducedInChapterId: 'ashwood-ch2',
    currentLocation: 'Beneath the writing desk', currentCondition: 'Tarnished',
    sourceSentence: 'A loose board beneath the writing desk conceals a tarnished key.',
    evidenceType: 'Inferred',
  },
]

const MERIDIAN_ENTITIES_CH1: WorldEntity[] = [
  {
    id: 'shifting-canal', name: 'The Shifting Canal', status: 'added',
    position: { x: 600, y: 460 }, radius: 26,
    introducedInChapterId: 'meridian-ch1',
    currentLocation: 'Vessant quarter', currentCondition: 'Position inconsistent between visits',
    sourceSentence: 'She had drawn the Vessant quarter four times now, and four times the canal had been in a different place.',
    evidenceType: 'Explicit',
  },
]

const AMBER_ENTITIES_CH1: WorldEntity[] = [
  {
    id: 'amber-pendant', name: 'Amber Pendant', status: 'added',
    position: { x: 640, y: 420 }, radius: 18,
    introducedInChapterId: 'amber-ch1',
    currentLocation: 'Third shelf, east gallery', currentCondition: 'Unlogged in the ledger',
    sourceSentence: "Marguerite's fingers found the amber pendant exactly where her hands remembered leaving it.",
    evidenceType: 'Inferred',
  },
]

// ─── Snapshots & patches ─────────────────────────────────────────────────────

export const SNAPSHOTS: Record<string, WorldSnapshot> = {
  'ashwood-ch1': { chapterId: 'ashwood-ch1', entities: ASHWOOD_ENTITIES_CH1 },
  'ashwood-ch2': { chapterId: 'ashwood-ch2', entities: ASHWOOD_ENTITIES_CH2 },
  'meridian-ch1': { chapterId: 'meridian-ch1', entities: MERIDIAN_ENTITIES_CH1 },
  'amber-ch1': { chapterId: 'amber-ch1', entities: AMBER_ENTITIES_CH1 },
}

export const PATCHES: Record<string, ScenePatch> = {
  'ashwood-ch1': {
    chapterId: 'ashwood-ch1',
    addedEntityIds: ASHWOOD_ENTITIES_CH1.map(e => e.id),
    movedEntityIds: [], updatedEntityIds: [], removedEntityIds: [],
  },
  'ashwood-ch2': {
    chapterId: 'ashwood-ch2',
    addedEntityIds: ['doorway', 'key'],
    movedEntityIds: ['armchair'],
    updatedEntityIds: ['portrait'],
    removedEntityIds: [],
  },
  'meridian-ch1': {
    chapterId: 'meridian-ch1',
    addedEntityIds: MERIDIAN_ENTITIES_CH1.map(e => e.id),
    movedEntityIds: [], updatedEntityIds: [], removedEntityIds: [],
  },
  'amber-ch1': {
    chapterId: 'amber-ch1',
    addedEntityIds: AMBER_ENTITIES_CH1.map(e => e.id),
    movedEntityIds: [], updatedEntityIds: [], removedEntityIds: [],
  },
}

export function summaryFromPatch(patch: ScenePatch, snapshot: WorldSnapshot): ChapterUpdateSummary {
  const changed = new Set([
    ...patch.addedEntityIds, ...patch.movedEntityIds, ...patch.updatedEntityIds, ...patch.removedEntityIds,
  ])
  return {
    addedEntityIds: patch.addedEntityIds,
    movedEntityIds: patch.movedEntityIds,
    updatedEntityIds: patch.updatedEntityIds,
    removedEntityIds: patch.removedEntityIds,
    unchangedEntityIds: snapshot.entities.filter(e => !changed.has(e.id)).map(e => e.id),
  }
}

// ─── Conflicts ────────────────────────────────────────────────────────────────

export const ASHWOOD_CONFLICT: Conflict = {
  id: 'conflict-fireplace-wall',
  entityId: 'fireplace',
  earlierClaim: { chapterId: 'ashwood-ch1', statement: 'Chapter 1: "A fireplace dominated the north wall..."' },
  latestClaim: { chapterId: 'ashwood-ch2', statement: 'Chapter 2: Thomas contrasts north window light against the fire, implying opposing walls.' },
  activeInterpretation: 'latest',
  status: 'open',
  confidenceNote: 'Moderate — possible authorial inconsistency in narration direction.',
}

export const CONFLICTS: Record<string, Conflict[]> = {
  'ashwood-ch1': [],
  'ashwood-ch2': [ASHWOOD_CONFLICT],
  'meridian-ch1': [],
  'amber-ch1': [],
}

// ─── Books ───────────────────────────────────────────────────────────────────

export const BOOKS: Book[] = [
  {
    id: 'book-ashwood',
    title: 'The Ashwood Inheritance',
    author: 'Eleanor Marsh',
    coverUrl: 'https://images.unsplash.com/photo-1481018085669-2bc6e4f00eed?w=380&h=540&fit=crop&auto=format',
    description: 'A governess arrives at a remote estate to find its rooms hold more secrets than its inhabitants will admit.',
    chapters: [
      { id: 'ashwood-ch1', bookId: 'book-ashwood', index: 1, title: 'Arrival', content: ASHWOOD_CH1_TEXT, processingStatus: 'not_started' },
      { id: 'ashwood-ch2', bookId: 'book-ashwood', index: 2, title: 'The Hall at Morning', content: ASHWOOD_CH2_TEXT, processingStatus: 'not_started' },
    ],
  },
  {
    id: 'book-meridian',
    title: 'Meridian',
    author: 'J. K. Voss',
    coverUrl: 'https://images.unsplash.com/photo-1612043743114-d19a560b70eb?w=380&h=540&fit=crop&auto=format',
    description: 'A cartographer mapping an unmapped city suspects the streets rearrange themselves at night.',
    chapters: [
      { id: 'meridian-ch1', bookId: 'book-meridian', index: 1, title: 'The Unmapped Street', content: MERIDIAN_CH1_TEXT, processingStatus: 'not_started' },
    ],
  },
  {
    id: 'book-amber',
    title: 'The Amber Archive',
    author: 'Constance Yu',
    coverUrl: 'https://images.unsplash.com/photo-1755631785480-7db2a0d4e22f?w=380&h=540&fit=crop&auto=format',
    description: 'Three archivists discover that the objects they catalogue are not merely records of the past.',
    chapters: [
      { id: 'amber-ch1', bookId: 'book-amber', index: 1, title: 'The Cataloguing Room', content: AMBER_CH1_TEXT, processingStatus: 'not_started' },
    ],
  },
]
