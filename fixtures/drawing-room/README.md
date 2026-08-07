# Drawing room — unseen story for live pipeline checks

A two-chapter Victorian interior written as an *unseen* input: no prepared
fixture, asset or scene grammar was authored for it. Feed the passages to
Member 1 and let extraction, contract validation, scene composition and asset
resolution run for real.

Running this through live extraction is what surfaced the Part 1 -> Part 2
breaks fixed in d4d2473 — serialized nulls rejected at the viewer boundary,
`update_entity` erasing names, distinct objects collapsing onto one asset, and a
flat tray taking a tall fallback that lifted everything off its table. The
prepared stories exercise none of them.

## Why it is shaped this way

- Chapter 2 is pure delta — the armchair moves, the lantern leaves, the mirror
  tilts, the clock stops — so it drives `update_entity` patches rather than a
  fresh snapshot.
- Objects deliberately straddle the catalog: the clock, armchair and console
  table hit approved assets, while others have no model and must reach the
  honest fallback instead of borrowing an unrelated mesh.

## Variants

| Files | Story id | Notes |
| --- | --- | --- |
| `passage_1.txt`, `passage_2.txt` | `drawing-room` | Original. The console table holds a porcelain tea set **on a lacquered tray** — the tray is the flat-support case. |
| `candlestick_passage_1.txt`, `candlestick_passage_2.txt` | `drawing-room-2` | Same prose with the tea set and tray replaced by a brass candlestick. Re-run after the flat-support fallback landed. |

Prefer the tray variant when touching fallback sizing or support surfaces.

## Running it

Start Member 1 and the reader as described under "Run imported text through live
Member 1" in [`../../docs/integrated-quick-start.md`](../../docs/integrated-quick-start.md),
then at <http://127.0.0.1:8443/> choose **Import Story** and upload or paste the
passages. `VITE_STORYWORLD_API_URL` must be set, or the import falls back to the
UI's generic local scene and nothing here is exercised.

Chapter order matters: `passage_1` must be ingested before `passage_2`, which
patches version 1 to version 2.

Note that with no Member 1 configured, an imported chapter renders the generic
placeholder scene and warns that it is not extraction output (76136c5) — that
placeholder is not a result from this fixture.
