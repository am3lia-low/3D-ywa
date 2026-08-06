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

On the sill beside his elbow lay a small square of parchment marked with a child's careful lines. Lydia recognised the drive, the front steps, and the long north wall. The ink had bled slightly where a thumb had rested before it dried.

She sat on the floor beside him without speaking. This, her training suggested, was sometimes the correct approach.

After several minutes, Thomas said: "She used to sit here in the mornings."

Lydia waited.

"She liked the light," he added. "In winter there was more light from the window than from the fire."

The portrait above the fireplace, she noticed then for the first time, was hanging slightly crooked — tilted perhaps three degrees to the right. She was almost certain it had been straight the evening before. She said nothing about it.

The smallest of the framed photographs was no longer on the mantelpiece. She found it face down among the correspondence on the desk, its narrow silver edge visible beneath an unopened letter. She did not turn it over.

Where the papers had shifted, a shallow drawer showed beneath the leather rim of the desk. It stood open by less than an inch. Its brass pull had been carved to resemble a knot in the oak, and Lydia was certain she had taken it for one the night before.

That afternoon she discovered that the door at the east end of the hall — which she had taken for a cupboard — was locked. Not with a key but with a bolt that had been painted over so many times it had effectively become part of the wall. The paint was new. Or rather: the final coat was new. Someone had re-bolted it recently.

She asked Mrs. Pale about it at supper.

Mrs. Pale looked at her plate. "Storage," she said.

"Beyond the door?"

Mrs. Pale's knife paused against the china. "There is no beyond. The east wall ends there."

"I see," said Lydia.

Neither of them spoke again until the clock — which, she had by now confirmed, remained stopped at twenty past four — seemed to mark the silence.`

const ASHWOOD_CH3_TEXT = `The little map was on the third stair when Lydia came down the following morning.

She recognised the careful outline of the drive and the dark stroke marking the north wall. It had been on the bay-window sill the day before. She left it where it was. By breakfast it had not moved again.

Thomas ate without looking at her. Mrs. Pale poured tea and asked whether Lydia had slept well, which was the first question she had offered since Lydia's arrival.

"Very well," Lydia said.

Mrs. Pale's hand paused above the cup, as though this had not been the expected answer.

In the hall, the red armchair remained by the bay window. The portrait was still crooked. The shallow drawer beneath the writing desk had been pushed shut; its false knot sat flush with the oak again. Only the door at the east end appeared less carefully restored. A narrow break in the painted edge showed where the bolt had been drawn back, and the door stood open by the width of two fingers.

Beyond it was not storage, or not only storage. A small schoolroom had been folded into the eastern side of the house: a low table, two chairs, shelves of copybooks gone soft with damp. Dust covered everything except a narrow path from the door to the table.

The small silver-edged photograph stood upright on the nearest shelf. In it, the woman from the portrait was younger and unsmiling, one hand resting on the shoulder of a boy Lydia did not recognise. The photograph had been face down on the writing desk the previous afternoon.

A small wooden horse figurine lay beneath the table, one ear missing. An open ledger rested above it, its ruled pages gone yellow at the edges. Across two pages, someone had drawn the front hall in brown ink: the fireplace, the window, the staircase, each reduced to a few careful lines. A small square marked the chair beside the window. At the east wall, where Lydia was standing, the nib had been pressed so hard that it had cut through the paper.

She heard a sound behind her and turned.

Thomas stood in the hall, watching not Lydia but the drawing.

"Did you make this?" she asked.

He looked toward the fireplace. The brass clock gave a single dry click.

When Lydia crossed the hall to examine it, the minute hand stood at twenty-one past four.`

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
    currentLocation: 'North wall', currentCondition: 'Cold, unlit',
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
    currentLocation: "Lydia's right side of the hall", currentCondition: 'Stacked with old correspondence',
    sourceSentence: 'To her right was a desk — heavy oak, leather-topped, stacked with correspondence.',
    evidenceType: 'Explicit',
  },
  {
    id: 'portrait', name: 'Portrait', status: 'unchanged',
    position: { x: 682, y: 182 }, radius: 18,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: 'Above the fireplace', currentCondition: 'No tilt recorded',
    sourceSentence: 'Above the fireplace hung a portrait she did not recognise.',
    evidenceType: 'Inferred',
  },
  {
    id: 'bay-window', name: 'Bay Window', status: 'unchanged',
    position: { x: 90, y: 300 }, radius: 20,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: 'North wall', currentCondition: 'Admitting moonlight',
    sourceSentence: 'The bay window on the north wall let in what little moonlight remained.',
    evidenceType: 'Explicit',
  },
  {
    id: 'staircase-door', name: 'Staircase Door', status: 'unchanged',
    position: { x: 865, y: 245 }, radius: 20,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: "Lydia's left side of the hall", currentCondition: 'Ajar',
    sourceSentence: 'To her left, a door, ajar, through which she could see part of a staircase.',
    evidenceType: 'Explicit',
  },
  {
    id: 'clock', name: 'Brass Clock', status: 'unchanged',
    position: { x: 625, y: 315 }, radius: 14,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: 'Fireplace mantelpiece', currentCondition: 'Stopped at 4:20',
    sourceSentence: 'A single brass clock that had stopped at twenty past four.',
    evidenceType: 'Explicit',
  },
  {
    id: 'small-photograph', name: 'Small Framed Portrait', status: 'unchanged',
    position: { x: 650, y: 322 }, radius: 12,
    introducedInChapterId: 'ashwood-ch1',
    currentLocation: 'Among the framed photographs on the mantelpiece', currentCondition: 'Individual details not yet observed',
    sourceSentence: 'Its mantelpiece bearing a row of framed photographs.',
    evidenceType: 'Inferred',
  },
]

const ASHWOOD_ENTITIES_CH2: WorldEntity[] = [
  { ...ASHWOOD_ENTITIES_CH1[0]! }, // fireplace — unchanged
  {
    id: 'armchair', name: 'Red Armchair', status: 'moved',
    position: { x: 145, y: 350 }, radius: 22,
    introducedInChapterId: 'ashwood-ch1', changedInChapterId: 'ashwood-ch2',
    currentLocation: 'Facing the bay window', previousLocation: 'Beside the fireplace',
    currentCondition: 'Facing the drive through the window', previousCondition: 'Angled toward the room',
    sourceSentence: 'He had pulled the red armchair from its position beside the fireplace and dragged it to face the bay window.',
    evidenceType: 'Explicit',
  },
  { ...ASHWOOD_ENTITIES_CH1[2]! }, // desk — unchanged
  {
    id: 'portrait', name: 'Portrait', status: 'updated',
    position: { x: 682, y: 182 }, radius: 18,
    introducedInChapterId: 'ashwood-ch1', changedInChapterId: 'ashwood-ch2',
    currentLocation: 'Above the fireplace', currentCondition: 'Tilted approximately 3° right', previousCondition: 'No tilt recorded',
    sourceSentence: 'The portrait above the fireplace was hanging slightly crooked — tilted perhaps three degrees to the right.',
    evidenceType: 'Explicit',
  },
  { ...ASHWOOD_ENTITIES_CH1[4]! }, // bay window — unchanged
  { ...ASHWOOD_ENTITIES_CH1[5]! }, // staircase door — unchanged
  { ...ASHWOOD_ENTITIES_CH1[6]! }, // clock — unchanged
  {
    id: 'small-photograph', name: 'Small Framed Portrait', status: 'moved',
    position: { x: 720, y: 550 }, radius: 12,
    introducedInChapterId: 'ashwood-ch1', changedInChapterId: 'ashwood-ch2',
    currentLocation: 'Among the correspondence on the writing desk', previousLocation: 'Among the framed photographs on the mantelpiece',
    currentCondition: 'Face down; narrow silver edge visible', previousCondition: 'Individual details not yet observed',
    sourceSentence: 'She found it face down among the correspondence on the desk, its narrow silver edge visible beneath an unopened letter.',
    evidenceType: 'Explicit',
  },
  {
    id: 'hidden-drawer', name: 'Concealed Desk Drawer', status: 'added',
    position: { x: 720, y: 585 }, radius: 12,
    introducedInChapterId: 'ashwood-ch2',
    currentLocation: 'Beneath the leather rim of the writing desk', currentCondition: 'Newly revealed; slightly open',
    sourceSentence: 'A shallow drawer showed beneath the leather rim of the desk. It stood open by less than an inch.',
    evidenceType: 'Explicit',
  },
  {
    id: 'east-hall-door', name: 'East Hall Door', status: 'added',
    position: { x: 920, y: 432 }, radius: 20,
    introducedInChapterId: 'ashwood-ch2',
    currentLocation: 'East end of the hall', currentCondition: 'Newly identified; locked with a painted-over bolt',
    sourceSentence: 'The door at the east end of the hall — which she had taken for a cupboard — was locked.',
    evidenceType: 'Explicit',
  },
  {
    id: 'hand-drawn-map', name: 'Hand-Drawn Parchment Map', status: 'added',
    position: { x: 110, y: 300 }, radius: 10,
    introducedInChapterId: 'ashwood-ch2',
    currentLocation: 'Bay-window sill', currentCondition: 'Newly drawn; ink slightly smudged before drying',
    sourceSentence: "On the sill beside his elbow lay a small square of parchment marked with a child's careful lines.",
    evidenceType: 'Explicit',
  },
]

const ASHWOOD_ENTITIES_CH3: WorldEntity[] = [
  { ...ASHWOOD_ENTITIES_CH2[0]!, status: 'unchanged' }, // fireplace
  { ...ASHWOOD_ENTITIES_CH2[1]!, status: 'unchanged' }, // armchair remains at window
  { ...ASHWOOD_ENTITIES_CH2[2]!, status: 'unchanged' }, // desk
  { ...ASHWOOD_ENTITIES_CH2[3]!, status: 'unchanged' }, // portrait remains crooked
  { ...ASHWOOD_ENTITIES_CH2[4]!, status: 'unchanged' }, // bay window
  { ...ASHWOOD_ENTITIES_CH2[5]!, status: 'unchanged' }, // staircase door
  {
    id: 'clock', name: 'Brass Clock', status: 'updated',
    position: { x: 625, y: 315 }, radius: 14,
    introducedInChapterId: 'ashwood-ch1', changedInChapterId: 'ashwood-ch3',
    currentLocation: 'Fireplace mantelpiece', currentCondition: 'Minute hand advanced to 4:21', previousCondition: 'Stopped at 4:20',
    sourceSentence: 'The brass clock gave a single dry click. The minute hand stood at twenty-one past four.',
    evidenceType: 'Explicit',
  },
  {
    id: 'small-photograph', name: 'Small Framed Portrait', status: 'moved',
    position: { x: 980, y: 315 }, radius: 12,
    introducedInChapterId: 'ashwood-ch1', changedInChapterId: 'ashwood-ch3',
    currentLocation: 'Shelf inside the former schoolroom', previousLocation: 'Among the correspondence on the writing desk',
    currentCondition: 'Standing upright; image visible', previousCondition: 'Face down; narrow silver edge visible',
    sourceSentence: 'The small silver-edged photograph stood upright on the nearest shelf.',
    evidenceType: 'Explicit',
  },
  {
    id: 'hidden-drawer', name: 'Concealed Desk Drawer', status: 'updated',
    position: { x: 720, y: 585 }, radius: 12,
    introducedInChapterId: 'ashwood-ch2', changedInChapterId: 'ashwood-ch3',
    currentLocation: 'Beneath the leather rim of the writing desk', currentCondition: 'Pushed shut; false knot flush with the oak', previousCondition: 'Newly revealed; slightly open',
    sourceSentence: 'The shallow drawer beneath the writing desk had been pushed shut; its false knot sat flush with the oak again.',
    evidenceType: 'Explicit',
  },
  {
    id: 'east-hall-door', name: 'East Hall Door', status: 'updated',
    position: { x: 920, y: 432 }, radius: 20,
    introducedInChapterId: 'ashwood-ch2', changedInChapterId: 'ashwood-ch3',
    currentLocation: 'East end of the hall', currentCondition: 'Unbolted and slightly open', previousCondition: 'Newly identified; locked with a painted-over bolt',
    sourceSentence: 'The door stood open by the width of two fingers.',
    evidenceType: 'Explicit',
  },
  {
    id: 'hand-drawn-map', name: 'Hand-Drawn Parchment Map', status: 'moved',
    position: { x: 850, y: 260 }, radius: 10,
    introducedInChapterId: 'ashwood-ch2', changedInChapterId: 'ashwood-ch3',
    currentLocation: 'Third stair', previousLocation: 'Bay-window sill',
    currentCondition: 'Drive and north-wall markings still visible', previousCondition: 'Newly drawn; ink slightly smudged before drying',
    sourceSentence: 'The little map was on the third stair when Lydia came down.',
    evidenceType: 'Explicit',
  },
  {
    id: 'schoolroom', name: 'Former Schoolroom', status: 'added',
    position: { x: 1010, y: 445 }, radius: 30,
    introducedInChapterId: 'ashwood-ch3',
    currentLocation: 'Beyond the east hall door', currentCondition: 'Disused; dusty except for a narrow path',
    sourceSentence: 'A small schoolroom had been folded into the eastern side of the house.',
    evidenceType: 'Explicit',
  },
  {
    id: 'horse-figurine', name: 'Horse Figurine', status: 'added',
    position: { x: 1010, y: 545 }, radius: 12,
    introducedInChapterId: 'ashwood-ch3',
    currentLocation: 'Beneath the schoolroom table', currentCondition: 'One ear missing',
    sourceSentence: 'A small wooden horse figurine lay beneath the table, one ear missing.',
    evidenceType: 'Explicit',
  },
  {
    id: 'schoolroom-ledger', name: 'Open Ledger', status: 'added',
    position: { x: 1000, y: 380 }, radius: 16,
    introducedInChapterId: 'ashwood-ch3',
    currentLocation: 'Schoolroom table', currentCondition: 'Open to an ink drawing of the hall; page cut through at the east wall',
    sourceSentence: 'An open ledger rested above it; across two pages, someone had drawn the front hall in brown ink.',
    evidenceType: 'Explicit',
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
  'ashwood-ch3': { chapterId: 'ashwood-ch3', entities: ASHWOOD_ENTITIES_CH3 },
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
    addedEntityIds: ['hidden-drawer', 'east-hall-door', 'hand-drawn-map'],
    movedEntityIds: ['armchair', 'small-photograph'],
    updatedEntityIds: ['portrait'],
    removedEntityIds: [],
  },
  'ashwood-ch3': {
    chapterId: 'ashwood-ch3',
    addedEntityIds: ['schoolroom', 'horse-figurine', 'schoolroom-ledger'],
    movedEntityIds: ['small-photograph', 'hand-drawn-map'],
    updatedEntityIds: ['hidden-drawer', 'east-hall-door', 'clock'],
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

export const ASHWOOD_EAST_WALL_CONFLICT: Conflict = {
  id: 'conflict-east-wall-room',
  entityId: 'east-hall-door',
  earlierClaim: {
    chapterId: 'ashwood-ch2',
    statement: 'Mrs. Pale states that there is no space beyond the east hall door and that the east wall ends there.',
  },
  latestClaim: {
    chapterId: 'ashwood-ch3',
    statement: 'Lydia opens the east hall door and enters a former schoolroom beyond the wall.',
  },
  activeInterpretation: 'latest',
  status: 'open',
  confidenceNote: 'High — the claims are directly incompatible unless Mrs. Pale is lying or the house has spatially anomalous architecture.',
}

export const CONFLICTS: Record<string, Conflict[]> = {
  'ashwood-ch1': [],
  'ashwood-ch2': [],
  'ashwood-ch3': [ASHWOOD_EAST_WALL_CONFLICT],
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
      { id: 'ashwood-ch3', bookId: 'book-ashwood', index: 3, title: 'The Room Beyond the Bolt', content: ASHWOOD_CH3_TEXT, processingStatus: 'not_started' },
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
