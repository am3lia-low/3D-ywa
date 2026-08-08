# 3D-YWA — Persistent StoryWorld 3D

Read a story, then step into the room it describes.

3D-YWA turns ordinary prose into a persistent, explorable 3D **setting**. As you
read each passage, the space updates to match what the text actually says: a
chair moves because the story moved it, a hidden door appears because the story
revealed it. Nothing resets between passages — the setting remembers.

**Settings only — no characters.** The renderer deliberately presents an
unpopulated environment. People, body parts, thoughts, moods and metaphors are
excluded during extraction; only locations, physical objects and architectural
structures are placed. A passage about two people arguing over a desk yields the
desk and the room, not the people.

> `[ILLUSTRATION: a passage of prose on the left, the rendered 3D
> study on the right. Lines connect the noun phrases "crimson armchair" and "tall
> window" to those objects in the scene; the clause "she pulled" is struck through
> with no line leaving it. The rendered room is empty of people — furniture,
> walls and light only.]`

<img width="800" height="450" alt="1" src="https://github.com/user-attachments/assets/d47e48da-e63e-46be-ad66-804bf06392e5" />

---

## Table of contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start-prepared-stories)
- [Running with live text](#running-with-live-text-import-your-own-prose)
- [Command-line pipeline](#command-line-pipeline)
- [All run modes](#all-run-modes)
- [Testing and verification](#testing-and-verification)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)

---

## What it does

Most text-to-3D tools generate a fresh scene per prompt, so the world silently
changes every time. 3D-YWA treats the world as **state that persists across
passages**. Each new passage produces a *patch* against the previous world, not a
brand-new world.

Three properties follow from that design:

| Property | What it means |
| --- | --- |
| **Persistent identity** | The desk in passage 3 is the same desk from passage 1 — same ID, same position. |
| **Factual grounding** | Objects appear because the prose says so. Unsupported objects are not invented. |
| **Honest failure** | When an object can't be represented, it renders a clear fallback instead of guessing. |
| **Settings, not characters** | Locations, objects and structures only. Characters are filtered out before placement. |

The system also records **conflicts**. If a later passage contradicts an earlier
one, that contradiction is stored and surfaced rather than silently overwritten.

> `[ILLUSTRATION: Three-panel sequence of the same empty study across passages
> 1→2→3, shot from one fixed camera — the armchair moves from the fireplace to
> the window, the portrait tilts crooked, the hidden doorway opens behind it. No
> figure appears in any panel; the room changes on its own. Caption: everything
> else stays exactly where it was.]`

<img width="800" height="450" alt="2" src="https://github.com/user-attachments/assets/fdee914b-c17f-4edd-8749-1dd1ec034cb3" />

---

## How it works

The project is a three-stage pipeline. Each stage is owned by one team member
and communicates only through a shared, versioned JSON contract.

```text
  Prose passage
       │
       ▼
┌──────────────────────┐
│ Part 1 — Narrative   │   Python · FastAPI · GPT-5.6 Terra
│ engine               │   Extracts places, objects, structures
│                      │   and their relations (characters excluded)
└──────────────────────┘
       │  WorldSnapshot + ScenePatch + VisualScenePlan
       ▼
┌──────────────────────┐
│ Part 2 — Spatial     │   TypeScript · React Three Fiber
│ runtime              │   Resolves coordinates, places approved assets
└──────────────────────┘
       │  Rendered, selectable scene
       ▼
┌──────────────────────┐
│ Part 3 — Reader UI   │   React · Vite
│                      │   Reading experience and scene explorer
└──────────────────────┘
```

**The three contract objects:**

- **`WorldSnapshot`** — the complete factual state of the world at one version.
- **`ScenePatch`** — the ordered changes that move the world from version N to N+1.
- **`VisualScenePlan`** — art direction: palette, lighting, archetypes, asset hints.

JSON Schemas live in [`contracts/`](contracts/). The authoritative cross-team
contract is [`docs/team-integration-contract.md`](docs/team-integration-contract.md).

![Data-flow diagram: one prose passage enters the Part 1 narrative engine, which
emits a WorldSnapshot, a ScenePatch and a VisualScenePlan — each shown with a
sample JSON payload — all three converging on the Part 2 spatial runtime.](docs/contract-data-flow.png)

---

## Prerequisites

| Requirement | Version | Check with |
| --- | --- | --- |
| Node.js | 22.x or newer | `node --version` |
| pnpm | 10.34 or newer | `pnpm --version` |
| Python | 3.11 or newer | `python --version` |

All 3D assets (models, textures, environment maps) are committed to the
repository. **You do not need to download or generate anything.** Git LFS is not
required. ComfyUI and TripoSR are optional development tools, not runtime
dependencies.

---

## Quick start (prepared stories)

This is the shortest path from a fresh clone to an explorable world. It needs
**no API key** — the three prepared stories use curated local fixtures.

### 1. Install dependencies

```bash
pnpm setup:integrated
```

This installs both lockfile-pinned dependency trees: the spatial runtime at the
repository root, and the reader UI under `Create UI Prototype for Hackathon/`.

### 2. Start the application

```bash
pnpm dev:integrated
```

### 3. Open it

Open <http://127.0.0.1:8443/>. The page identifies itself as **3D-YWA** and
offers three prepared stories:

- The Ashwood Inheritance
- Meridian
- The Amber Archive

Choose **Start Reading**, let the passage-processing stages finish, then choose
**Explore the Scene**.

> `[ILLUSTRATION: Annotated screenshot of the library screen with the three story
> cards, with callouts on "Start Reading" and "Import Story".]`

<img width="800" height="450" alt="3" src="https://github.com/user-attachments/assets/77536cc2-33ce-4d28-a5cc-7ab2bdf49cd9" />

### 4. Explore

| Action | Control |
| --- | --- |
| Pan | Left-drag |
| Rotate | Right-drag |
| Zoom | Scroll wheel / pinch |
| Travel to a point | Double-click the floor |
| Inspect an object | Click it |
| Reset the view | Reset-view control |

Selecting an object opens an inspector showing its state, provenance,
confidence, relations, and any recorded conflicts.

> `[ILLUSTRATION: The explorer with an object selected — inspector panel open,
> relation lines drawn to related objects with predicate labels.]`

<img width="800" height="450" alt="4" src="https://github.com/user-attachments/assets/cc524dbd-4d3a-4369-95cd-a8148f5a9753" />

---

## Running with live text (import your own prose)

Prepared stories use curated fixtures. To send **your own** text through the
narrative engine, run the Python API alongside the UI. This path **does** use API
credits.

### 1. Set up the Python environment

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
```

### 2. Configure your API key

```powershell
Copy-Item .env.example .env
```

Edit `.env` and replace `OPENAI_API_KEY=replace_me` with your real key. `.env` is
git-ignored and loaded automatically. `STORYWORLD_MODEL` is optional —
`gpt-5.6-terra` is already the default.

### 3. Point the UI at the API

```powershell
Copy-Item "Create UI Prototype for Hackathon/.env.example" "Create UI Prototype for Hackathon/.env.local"
```

This sets `VITE_STORYWORLD_API_URL=http://127.0.0.1:8000`. It is deliberately
opt-in: without it, imported stories fall back to generic local handling.

### 4. Run both services — two terminals

**Terminal 1 — the narrative engine:**

```powershell
& ".\.venv\Scripts\python.exe" -m uvicorn storyworld.api:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — the reader and renderer:**

```powershell
pnpm dev:integrated
```

### 5. Import a story

Open <http://127.0.0.1:8443/>, choose **Import Story**, paste text or upload a
`.txt` file, confirm the detected chapters, and open the book. Each chapter is
posted to the engine, validated against the shared contract, compiled by the
runtime, and warmed by the reader before **Explore** unlocks.

> `[ILLUSTRATION: The import flow as a filmstrip — paste text → chapter detection
> → processing stages → Explore unlocked.]`

---

## Command-line pipeline

You can drive the narrative engine directly, without the UI. This is the
clearest way to see the persistence model at work.

### Process the four demo passages

Run these **in order** — each passage updates the snapshot the previous one left
behind:

```powershell
python -m storyworld.cli process --story-id study-demo --passage-id P1 --file tests/fixtures/passage_1.txt
python -m storyworld.cli process --story-id study-demo --passage-id P2 --file tests/fixtures/passage_2.txt
python -m storyworld.cli process --story-id study-demo --passage-id P3 --file tests/fixtures/passage_3.txt
python -m storyworld.cli process --story-id study-demo --passage-id P4 --file tests/fixtures/passage_4.txt
```

What the four demo passages demonstrate:

1. **P1** establishes the study — desk, key, window, armchair, fireplace, portrait, locked door. Mara appears in the prose but is filtered out: the snapshot holds 7 entities, none of them a character.
2. **P2** reuses every ID and moves the armchair to the window; the key goes missing.
3. **P3** discovers the hidden doorway behind the portrait and the corridor beyond.
4. **P4** preserves the established desk position and **records a conflict**.

Print the most recent snapshot:

```powershell
python -m storyworld.cli latest --story-id study-demo
```

Replay a cached extraction instead of calling the model (useful for demos, and
free):

```powershell
python -m storyworld.cli process --story-id study-demo --passage-id P2 --file tests/fixtures/passage_2.txt --replay-cached-extraction
```

Artifacts are written under `data/<story-id>/`:

```text
data/study-demo/
  sentences/      preprocessed sentences
  extractions/    raw model extractions (cacheable)
  snapshots/      versioned world state
  patches/        version-to-version changes
  conflicts/      recorded contradictions
```

![The four demo passages side by side with their prose, and beneath each the
patch operations it produced: P1 discovers the study and adds 7 entities, P2 adds
nothing and only moves the armchair, P3 opens the hidden doorway and corridor, and
P4 records a spatial contradiction.](docs/passage-patch-sequence.png)

### Run an unseen story instead of the demo passages

`passage_1.txt` … `passage_4.txt` are the *seen* demo — their extractions are
cached and mirrored by test fixtures. To watch the pipeline work on prose it has
no prepared answer for, use the drawing-room fixtures. `--file` accepts any path
and `--data-dir` keeps the output away from `data/`:

```powershell
python -m storyworld.cli --data-dir test_runs/candlestick process --story-id drawing-room-2 --passage-id P1 --file fixtures/drawing-room/candlestick_passage_1.txt
python -m storyworld.cli --data-dir test_runs/candlestick process --story-id drawing-room-2 --passage-id P2 --file fixtures/drawing-room/candlestick_passage_2.txt
```

**This calls the live model and uses API credits.** It needs a real
`OPENAI_API_KEY` in `.env`. Chapter order matters — `P1` must run before `P2`,
which patches version 1 into version 2.

Chapter 2 is written as pure delta (the armchair moves, the lantern leaves, the
mirror tilts, the clock stops), so a correct run reports **no new entities** and
several updates:

```text
P1  entities_added: 13   locations_discovered: 1   conflicts_added: 0
P2  entities_added: 0    entities_updated: 3       conflicts_added: 1
```

The conflict in chapter 2 is expected, not a failure — it is the reconciler
catching a contradiction between chapters.

Inspect the result:

```powershell
python -m storyworld.cli --data-dir test_runs/candlestick latest --story-id drawing-room-2
```

Two other variants exist. `fixtures/drawing-room/passage_1.txt` and
`passage_2.txt` (story id `drawing-room`) place a tea set **on a lacquered
tray** — prefer that pair when touching fallback sizing or support surfaces. See
[`fixtures/drawing-room/README.md`](fixtures/drawing-room/README.md) for why
these fixtures are shaped the way they are.

To exercise the *full* three-part path rather than Part 1 alone, run the two
services from [Running with live text](#running-with-live-text-import-your-own-prose)
and upload the same `.txt` files through **Import Story**.

### HTTP API

```powershell
uvicorn storyworld.api:app --reload
```

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/stories/{story_id}/passages` | Process one passage |
| `GET` | `/api/stories/{story_id}/snapshots/latest` | Fetch latest snapshot |
| `GET` | `/health` | Health check |

```http
POST /api/stories/{story_id}/passages
Content-Type: application/json

{
  "passage_id": "P1",
  "text": "The current story passage...",
  "replay_cached_extraction": false
}
```

Interactive docs: <http://127.0.0.1:8000/docs>.

The opening response omits its patch and includes `visual_plan`; later responses
include an ordered `ScenePatch`. CORS defaults allow ports 8443 and 5173 and can
be overridden with `STORYWORLD_CORS_ORIGINS`.

---

## All run modes

| Command | URL | Use it for |
| --- | --- | --- |
| `pnpm dev:integrated` | `http://127.0.0.1:8443/` | **The main application.** Demos and team review. |
| `pnpm dev` | `http://127.0.0.1:5173/` | Renderer laboratory and fixture selector; spatial debugging only. |
| `uvicorn storyworld.api:app --reload` | `http://127.0.0.1:8000/` | Narrative engine on its own. |
| `pnpm build:integrated` | — | Production build into `Create UI Prototype for Hackathon/dist/`. |

Don't run both dev servers at once unless you're deliberately comparing the
product integration against the renderer laboratory.

---

## Testing and verification

### Python tests

Deterministic and free — they use curated extractions, not the live model:

```powershell
python -m unittest discover -s tests -v
```

`pytest` also works (`python -m pytest tests -q`) but is not a declared
dependency, so `unittest` is the zero-install path.

> **Note:** these tests read `passage_1.txt` … `passage_4.txt` from
> `tests/fixtures/`. The prose supplies the sentence text recorded as entity
> provenance; the extractions themselves are stubbed, so the suite is
> deterministic and costs no API credits.

### TypeScript tests

```bash
pnpm test                # unit tests
pnpm scenes:preflight    # validate every moment of every built-in story
pnpm handoff:check       # compile-check the public consumer API
```

### Before merging or recording a demo

```bash
pnpm check:integrated    # fast: handoff + preflight + build
pnpm verify              # full gate: tests, typecheck, assets, build, bundle
```

`pnpm verify` includes `assets:runtime:check`, a portability gate that follows
every local glTF buffer and image dependency and fails if any required asset is
missing, empty, or untracked.

### Optional live evaluation

Sends all four passages to the configured model and scores the handoff. **Uses
API credits** — choose a fresh directory per run:

```powershell
python scripts/run_live_evaluation.py --data-dir test_runs/live_eval --story-id study-live-eval
```

---

## Project layout

```text
storyworld/          Part 1 — Python narrative engine
  models.py            extraction, snapshot, patch, conflict schemas
  extractor.py         model prompt and Responses API call
  handoff.py           translation into the shared contract
  resolver.py          stable identity and alias resolution
  reconciler.py        deterministic state updates and conflicts
  storage.py           versioned JSON persistence
  api.py               FastAPI service
  cli.py               local processing commands

src/                 Part 2 — spatial runtime (React Three Fiber)
  runtime/             scene compilation, placement, asset resolution
  components/          WorldViewer and scene chrome
  contracts/           runtime-side contract validation

Create UI Prototype for Hackathon/   Part 3 — reader UI
  src/App.tsx          reading experience
  src/components/WorldViewer.tsx   adapter into @spatial-runtime

contracts/           JSON Schemas (Draft 2020-12)
fixtures/            curated snapshots, patches and visual plans
  drawing-room/        unseen-story prose for live pipeline checks
tests/               Python test suite
  fixtures/            the four demo passages the suite reads
public/              committed models, textures, environments, safe meshes
scripts/             asset import, validation and evaluation tooling
docs/                detailed design and handoff documentation
archives/            historical run outputs, not part of the pipeline
```

Part 3 imports the runtime **only** through the `@spatial-runtime` alias, which
resolves to the repository-root `src/index.ts`. Renderer files are never copied
into the UI folder.

### Key documentation

| Document | Covers |
| --- | --- |
| [`docs/team-integration-contract.md`](docs/team-integration-contract.md) | Authoritative cross-team contract |
| [`docs/integrated-quick-start.md`](docs/integrated-quick-start.md) | Fresh-clone startup |
| [`docs/part1-live-adapter.md`](docs/part1-live-adapter.md) | Live passage responses |
| [`docs/scene-composition.md`](docs/scene-composition.md) | Placement and composition rules |
| [`docs/approved-asset-pipeline.md`](docs/approved-asset-pipeline.md) | Asset review and promotion |
| [`docs/multi-location-traversal.md`](docs/multi-location-traversal.md) | Room-to-room traversal |
| [`docs/milestones.md`](docs/milestones.md) | Development history of the spatial runtime |
| [`fixtures/drawing-room/README.md`](fixtures/drawing-room/README.md) | Unseen-story fixtures for live pipeline checks |

---

## Troubleshooting

**`styleText` or Vite startup error**
Node is older than 22. Switch Node versions and rerun `pnpm setup:integrated`.

**Port 8443 already in use**
Stop the older Vite process, or set a temporary port:
`$env:PORT=8444` before `pnpm dev:integrated`.

**World is blank but the reader UI loads**
Hard-refresh once, then check the browser console for a missing file under
`/models`, `/textures`, `/environments` or `/safe-meshes`. Confirm the full root
`public/` directory exists on your branch.

**Python tests fail with `FileNotFoundError: passage_1.txt`**
The demo passage files were moved out of `tests/fixtures/`. Restore them —
`tests/test_pipeline.py`, `test_handoff.py` and `test_api.py` resolve them
relative to that directory via their `PASSAGES` constant.

**Dependencies disagree after switching branches**
Delete neither lockfile. Run `pnpm setup:integrated` again so both projects
match their committed locks.

**Imported story reports no scene**
Arbitrary prose needs a real narrative-engine response to supply the snapshot,
patch and visual plan. Confirm the API is running on port 8000 and that
`VITE_STORYWORLD_API_URL` is set in
`Create UI Prototype for Hackathon/.env.local`.

---

## License

Vendored 3D assets are CC0 and retain their source and license manifests under
[`docs/licenses/`](docs/licenses/).
