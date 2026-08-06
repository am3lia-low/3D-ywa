# The Ashwood Inheritance: cross-chapter overview

This document summarizes how the persistent world changes across the three
prepared chapters of **The Ashwood Inheritance**. It is a teammate-facing
reference for checking narrative continuity, scene updates, and conflict
handling against the mock data.

## Chapters

| Chapter | ID | Title | World-state role |
| --- | --- | --- | --- |
| 1 | `ashwood-ch1` | Arrival | Establishes the front hall and its baseline objects. |
| 2 | `ashwood-ch2` | The Hall at Morning | Moves two objects, updates the portrait, and reveals three objects. |
| 3 | `ashwood-ch3` | The Room Beyond the Bolt | Opens the east hall door, reveals the schoolroom, and advances several persistent clues. |

## Full cross-chapter overview

**Bold text** marks the chapter in which an item is introduced, moved, or
meaningfully updated. “Unknown” means the narrative has not established the
item yet; it does not assert that the item is absent from the fictional world.

| Item | Chapter 1 | Chapter 2 | Chapter 3 |
| --- | --- | --- | --- |
| Fireplace | Baseline: cold and unlit on the north wall | Unchanged | Unchanged |
| Red armchair | Beside fireplace, angled toward room | **Moved to face bay window** | Remains by window |
| Writing desk | Baseline: old correspondence on leather-topped oak desk | Unchanged | Unchanged |
| Portrait | Above fireplace; no tilt recorded | **Tilted approximately 3° right** | Remains crooked |
| Bay window | Baseline: north wall, admitting moonlight | Unchanged | Unchanged |
| Staircase door | Ajar, with part of staircase visible | Unchanged | Unchanged |
| Brass clock | Stopped at 4:20 on mantelpiece | Unchanged | **Advances to 4:21** |
| Small framed portrait | Among photographs on mantelpiece | **Moved face down to writing desk** | **Moved upright to schoolroom shelf** |
| Concealed desk drawer | Unknown | **Revealed slightly open** | **Pushed shut; false knot flush with oak** |
| East hall door | Mistaken for a cupboard | **Identified and locked by painted-over bolt** | **Unbolted and slightly open** |
| Hand-drawn parchment map | Unknown | **Introduced on bay-window sill** | **Moved to third stair** |
| Former schoolroom | Unknown | Claimed not to exist beyond the east wall | **Revealed beyond east hall door** |
| Horse figurine | Unknown | Unknown | **Discovered beneath schoolroom table; one ear missing** |
| Open ledger | Unknown | Unknown | **Discovered on schoolroom table, open to a drawing of the hall** |

## State changes by chapter

### Chapter 1 — baseline

Eight tracked entities establish the front hall: fireplace, red armchair,
writing desk, portrait, bay window, staircase door, brass clock, and small
framed portrait.

### Chapter 2 — hall changes and new clues

- **Added:** concealed desk drawer, east hall door, and hand-drawn parchment map.
- **Moved:** red armchair and small framed portrait.
- **Updated:** portrait.
- **Unchanged:** fireplace, writing desk, bay window, staircase door, and brass clock.

### Chapter 3 — room beyond the bolt

- **Added:** former schoolroom, horse figurine, and open ledger.
- **Moved:** small framed portrait and hand-drawn parchment map.
- **Updated:** concealed desk drawer, east hall door, and brass clock.
- **Unchanged:** fireplace, red armchair, writing desk, portrait, bay window, and staircase door.

## Open continuity conflict

The current mock data intentionally records one unresolved conflict for
`east-hall-door`:

- In Chapter 2, Mrs. Pale says there is no space beyond the door and that the
  east wall ends there.
- In Chapter 3, Lydia opens the door and enters a former schoolroom beyond that
  wall.

The active interpretation follows Chapter 3. The contradiction remains open
because Mrs. Pale may be lying, or the house may have spatially anomalous
architecture.

## Source of truth

This overview reflects the chapter prose, `SNAPSHOTS`, `PATCHES`, and
`CONFLICTS` definitions in:

`Create UI Prototype for Hackathon/src/data/mockData.ts`
