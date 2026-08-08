# Persistent StoryWorld 3D — Spatial Runtime

Member 2's fixture-driven React Three Fiber runtime for turning versioned world-state JSON into a stable, explorable room.

## Team handoff: start here

The authoritative cross-member input/output contract is
[`docs/team-integration-contract.md`](docs/team-integration-contract.md). It
defines exactly what Member 1 emits, what Member 2 validates and renders, what
Member 3 imports and owns, the required version/identity rules, failure recovery,
valid JSON examples, and the acceptance commands before integration.

Detailed implementation references remain in:

- [`docs/integrated-quick-start.md`](docs/integrated-quick-start.md) for starting the combined Member 3 UI and Member 2 world from a fresh clone.
- [`docs/member-1-and-3-brief.md`](docs/member-1-and-3-brief.md) for the short interactivity, provenance, and real-loading handoff update.
- [`docs/member-2-asset-generation-flow.png`](docs/member-2-asset-generation-flow.png) for the shareable Member 2 resolution and generation flow.
- [`docs/multi-location-traversal.md`](docs/multi-location-traversal.md) for enabling factual room-to-room door traversal and assigning cross-team ownership.
- [`docs/part1-live-adapter.md`](docs/part1-live-adapter.md) for live passage responses.
- [`docs/story-package.md`](docs/story-package.md) for batch/offline story packages.
- [`docs/member-3-handoff.md`](docs/member-3-handoff.md) for the reader integration.
- [`docs/editing-part1-story-package.md`](docs/editing-part1-story-package.md) for editing the canonical fixture.

## Milestone 1

- Preserves the proposal's frozen `WorldSnapshot`, `ScenePatch`, and `WorldViewer` surfaces.
- Adds renderer-owned nested entity, relation, transform and patch-operation types.
- Resolves explicit coordinates and semantic relations with deterministic collision correction.
- Applies ordered scene patches while retaining stable identity for untouched entities.
- Renders a selectable room with resilient map-style camera controls, a semantic asset registry, unknown-asset fallbacks and change transitions.
- Demonstrates three passages using the required fixture files.

## Milestone 2

- Pins resolved coordinates across versions, placing only added or explicitly moved entities.
- Preserves layout-item references for unaffected entities, including primitive fallbacks.
- Keeps removed entities as temporary exit nodes so they animate out before unmounting.
- Covers adversarial insertion, movement, removal and fixture progression with continuity tests.

## Milestone 3

- Loads normalized glTF assets through the semantic registry, including a 70+ model optimized CC0 Poly Haven library with three browser LODs for furniture, props, lighting, architecture and natural landmarks.
- Uses suspense placeholders while models load and per-entity primitive fallbacks on failure.
- Preserves selection and change highlighting across modeled and fallback assets.
- Generates the original fallback model set reproducibly with `pnpm models:generate`; vendored CC0 assets retain source and license manifests.

## Milestone 4

- Validates `WorldSnapshot` and `ScenePatch` values at the viewer boundary.
- Publishes Draft 2020-12 JSON Schemas under `contracts/` for backend and product integration.
- Rejects duplicate IDs, broken semantic references, malformed operations and non-forward versions.
- Keeps the last valid scene mounted while displaying recoverable patch errors.

## Milestone 5

- Resolves any location in the plural `locations` contract instead of assuming the first room.
- Switches rooms without rolling back the current patched snapshot version.
- Filters entities and semantic relations to the active location and resets the camera to its bounds.
- Handles entities moving between rooms as an exit from one spatial layout and an entry into another.

## Milestone 6

- Adds Google Maps-style navigation with left-drag panning, right-drag rotation and wheel/pinch zoom.
- Smoothly travels to a bounded floor point on double-click and centers selected entities.
- Keeps navigation targets inside the active room with a dedicated camera controller that survives rerenders and repeated pan/rotate/zoom gestures.
- Uses 1K PBR plaster, wood, stone and worn-fabric maps for the attic architecture and hero surfaces.
- Provides a reset-view control that glides back to the room overview.

## Milestone 7

- Draws selected semantic relations directly between visible entities with compact predicate labels.
- Marks unresolved entity conflicts in-scene and summarizes open world facts in the viewer chrome.
- Adds a reusable entity inspector for state, provenance, confidence, relations and conflict details.
- Lets inspector relation links focus related entities through the map-style camera.
- Keeps selection mounted while patches update state and relation context in place.

## Milestone 8

- Lazy-loads the WebGL viewer so the initial application chunk stays small.
- Splits React, Three.js and R3F dependencies into deterministic cacheable chunks below 500 KB.
- Adapts device pixel ratio and shadow rendering across low, balanced and high performance tiers.
- Adds an ordered stream controller that queues burst patches, ignores duplicates and pauses on gaps.
- Publishes a React stream binding driven by `WorldViewer.onPatchApplied` acknowledgements.

## Milestone 9

- Keeps visual-registry refreshes independent from narrative snapshot versions, so asset-plan updates cannot rewind an in-progress passage stream.
- Sizes relational chairs at human scale and automatically faces furniture toward the object it is meant to interact with unless Part 1 supplies an explicit rotation.
- Executes pending asset jobs through a provider-neutral asynchronous worker with progress events, an optional optimization stage, retries for failures and canonical entity-ID registration.

## Milestone 10

- Implements a real local `SceneAssetProvider` backed by the MIT-licensed TripoSR image-to-3D model.
- Keeps prompt-to-reference-image and reference-image-to-3D as separate replaceable stages instead of pretending TripoSR consumes novel prose.
- Runs the neural reconstruction on CUDA and uses a reproducible CPU marching-cubes fallback for this machine's newer Visual Studio toolchain.
- Proves the pipeline with a generated lantern reference and a canonical `lantern-1` GLB that the viewer loads from `public/generated/`.

## Milestone 11

- Adds a local ComfyUI reference-image provider using the full SDXL 1.0 base checkpoint and only core workflow nodes.
- Preserves Part 1's visual description, materials, colors and condition in the generation prompt, with deterministic retry seeds.
- Enforces an approval gate before reconstruction so collages, cropped objects and narrative contradictions such as a lit “unlit” lantern cannot silently enter the world.
- Proves the complete local path from `visual_scene_plan_3.json` to an approved PNG and a content-addressed TripoSR reconstruction under the canonical entity ID.

## Milestone 12

- Adds a serializable, revisioned asset queue that resumes reference generation, human review, reconstruction and optimization without losing canonical entity identity.
- Persists every state transition and keeps rejected or failed jobs retryable without promoting them into the runtime registry.
- Automatically rejects structurally invalid image payloads and exposes a validator boundary for stronger semantic or composition checks.
- Routes volumetric objects to image-to-mesh and planar assets such as maps, rugs and doors to generated textures on controlled geometry.
- Proves the template route with an approved narrow timber door while retaining the existing Archive-vault traversal behavior.
- Adds a second review gate for the reconstructed runtime asset; the initial lantern mesh was rejected there and the authored fallback was restored.

## Milestone 13

- Makes a licensed, style-aware approved asset library the normal renderer path.
- Resolves by canonical asset key first and deterministic semantic matching second.
- Keeps unsupported objects honest instead of forcing unrelated approved models.
- Hides the experimental generation lab from the default product route.

## Milestone 14

- Adds a second story with entirely different canonical IDs and no hard-coded asset keys for common objects.
- Selects a distinct moonlit botanical-gothic style kit from visual-plan context.
- Composes a modular glasshouse from iron framing, translucent panes, tiled flooring, planters and climbing vines.
- Reuses approved furniture semantically while rendering the unique celestial orrery as a deliberate designed fallback.
- Applies a second-story patch without changing the environment or approved identities.

## Milestone 15

- Compiles time of day, weather, palette, warmth and contrast into one deterministic atmosphere profile shared by every environment family.
- Adds cinematic key/fill lighting, adaptive exposure and bounded fog without requiring story-specific renderer branches.
- Adds soft contact shading to enclosed POV and Walk views while preserving clean overview and outdoor terrain rendering.
- Renders requested ground mist with transparent camera-facing layers and keeps the skydome centered on the camera so its edge never appears at overview distance.

## Milestone 16

- Generates normalized support-surface measurements directly from approved safe-mesh triangles and rejects stale metadata during verification.
- Places unconstrained support objects before resolving dependent relations, so `on` and facing constraints cannot silently fall back to unrelated coordinates.
- Rejects imported story packages whose compiled composition contains blocking scale, overlap, access or support errors.
- Adds `pnpm scenes:preflight` to validate every moment of every built-in story through the same package and scene-compilation path used by the app.

## Component contract

```tsx
<WorldViewer
  snapshot={snapshot}
  patch={patch}
  visualPlan={visualPlan}
  activeLocationId={activeLocationId}
  selectedEntityId={selectedEntityId}
  onEntitySelect={handleEntitySelect}
  onRuntimeError={handleRuntimeError}
  onPatchApplied={handlePatchApplied}
/>
```

## Visual scene generation prototype

The renderer can consume a versioned `VisualScenePlan` alongside factual world state. The plan carries novel-derived art direction, location archetypes, semantic architecture and dressing tags, lighting intent, visual entity descriptions, asset search/generation prompts and explicitly presentation-only connections.

The prototype pipeline is:

```text
selected novel segment
  -> WorldSnapshot / ScenePatch
  -> VisualScenePlan
  -> select one story style kit
  -> resolveApprovedAssetLibrary(...) by canonical key, semantics and visual tags
  -> approved registry + architecture + palette + lighting + dressing
  -> buildSceneManifest(...)
  -> WorldViewer (ready)
     or honest fallback + asynchronous hero-asset job (assets_pending)
        -> revisioned asset queue
        -> generate reference candidates
        -> automatic integrity checks
        -> human review (needs_review)
        -> image-to-mesh or surface-template provider
        -> in-world asset review (needs_asset_review)
        -> promoted ready manifest
```

Part 1 fixture targets:

- `fixtures/visual_scene_plan_1.json` — opening plan for world version 1.
- `fixtures/visual_scene_plan_3.json` — revised plan after the passage-3 reveal.
- `fixtures/snapshot_conservatory_1.json` and `fixtures/patch_conservatory_2.json` — second-story generalization proof.
- `fixtures/visual_scene_plan_conservatory_1.json` and `fixtures/visual_scene_plan_conservatory_2.json` — botanical-gothic environment and asset context.
- `fixtures/snapshot_woodland_1.json` and `fixtures/visual_scene_plan_woodland_1.json` — conifer-heavy misted woodland input.
- `fixtures/snapshot_sunbell_grove_1.json`, `fixtures/patch_sunbell_grove_2.json` and matching visual plans — unrelated broadleaf woodland plus patch-persistence proof.

The shared TypeScript surface is `src/contracts/visualScenePlan.ts`. Renderer decisions are compiled in `src/runtime/sceneCompiler.ts`, while `src/runtime/sceneBuildPipeline.ts` resolves project/catalog assets under canonical entity IDs and emits explicit jobs for missing assets. Canonical story, location and entity IDs are checked before visual context is accepted; decorative presentation never mutates `WorldSnapshot`.

`ready` manifests can render immediately. For `assets_pending`,
`src/runtime/sceneAssetWorker.ts` executes jobs concurrently, calls a supplied
search/generation provider, optionally optimizes each result and registers it
under the existing canonical entity ID. Failed jobs stay in the manifest for a
retry. `src/runtime/tripoSrProvider.ts` is the first real adapter: a replaceable
`SceneReferenceImageProvider` supplies a clean reference image, then the local
service reconstructs a normalized GLB and returns its public model URL.

`src/runtime/sceneAssetQueue.ts` is the resumable production-facing path. Its
`advanceSceneAssetQueue(...)` function processes every runnable item and pauses
naturally at review. `promoteReadySceneAssets(...)` installs only completed
outputs. Queue storage is adapter-based; a browser storage adapter is included
for the prototype, while a deployed worker can persist the same JSON structure
in object storage or a database. Reconstruction providers are selected by the
job's `image_to_mesh` or `surface_template` strategy.

Local TripoSR setup and proof:

```powershell
pnpm triposr:setup
pnpm triposr:serve
# in a second terminal
pnpm triposr:prove
```

Local ComfyUI setup and reference-image proof:

```powershell
pnpm comfyui:setup
pnpm comfyui:serve
# in a second terminal; inspect the PNG before reconstruction
pnpm comfyui:prove
```

Large Python packages and model weights stay in ignored `.local/`. The checked-in
approved proof input is `fixtures/reference-images/comfyui-lantern-1-v1.png`.
The first TripoSR result proved the service integration but failed the later
in-world asset review, so the runtime retains `/models/lantern.glb`. The
reference generator can retry deterministically with `-SeedOffset`; both the
reference and reconstructed asset must now be approved before registry
promotion.

The experimental queue is intentionally hidden from the normal demo. In local
development, append `?assetLab=1` to expose the **Async visual pipeline** panel.
It regenerates one selected canonical entity at a time, persists the
active candidate across refreshes, and blocks stale jobs when the snapshot or
visual-plan version changes. The browser calls ComfyUI at
`http://127.0.0.1:8190` and TripoSR at `http://127.0.0.1:8123` by default; both
endpoints are editable in the panel. Planar `surface_template` jobs can be
previewed after ComfyUI without TripoSR. Volumetric `image_to_mesh` jobs need
both services. No output replaces the live registry until its reference and
runtime previews have each been approved.

Reference generation is deterministic for a given entity, prompt and variation
seed. The panel exposes an explicit next-variation path, warns before replacing
a curated model with experimental single-view reconstruction, and requires the
exact reconstructed artifact to be previewed in-world before approval. TripoSR
drafts use a bright vertex-colour diagnostic material during review so missing
PBR textures are visible rather than reading as an unexplained black silhouette.
Approved surface references are stored only once and materialized as runtime
texture URLs on preview, avoiding browser-storage duplication.

Browser storage is deliberately an MVP queue store. A production deployment
should move candidate image bytes, GLBs and queue JSON to durable object/database
storage while retaining the same `SceneAssetQueueStore` boundary.

`src/runtime/approvedAssetLibrary.ts` is the normal production-facing path. It
selects one coherent story style kit, maps entities to assets with recorded
source and license metadata, installs choices under canonical entity IDs and
leaves unsupported objects unresolved instead of forcing an unrelated model.
The opening fixture has 100% approved-asset coverage, and the same catalog IDs
remain stable as passages 2 and 3 add or move entities.

`src/runtime/sceneRecipeCompiler.ts` is the single production compilation
boundary. Given a `WorldSnapshot` and its matching `VisualScenePlan`, it emits:

- selected architecture, surface and dressing modules with their source tags;
- the approved asset registry and canonical entity-to-catalog bindings;
- designed-fallback IDs and important-object generation jobs;
- placement constraints derived from factual relations; and
- an inspectable asset-coverage summary.

```ts
const recipe = compileSceneRecipe(snapshot, visualPlan);

<WorldViewer
  snapshot={snapshot}
  patch={patch}
  visualPlan={visualPlan}
  sceneRecipe={recipe}
  assetRegistry={recipe.assetRegistry}
/>
```

The renderer chooses registered modules from recipe IDs; it does not branch on
story IDs. The current attic and conservatory are therefore regression fixtures
for two different recipes rather than two custom application screens.

Woodland scenes additionally pass through `GhibliWoodlandKit`, a deterministic
environment grammar seeded from canonical `locationId` and Part 1 visual
semantics. It composes an optimized CC0 Quaternius tree/plant/rock family around
a readable path without receiving `storyId` or minting narrative entities. The
Mosswood and Sunbell fixtures deliberately use the same grammar with different
conifer/broadleaf balance, atmosphere and composition. Sunbell passage two then
moves and lights its canonical lantern while the generated grove remains stable.

## Universal visual quality

Unfamiliar setting language now passes through a semantic art-direction layer
that resolves broad indoor, courtyard, glasshouse and woodland vocabulary to
tested environment modules. Every scene receives local image-based lighting;
unregistered objects receive proportioned category-specific designed fallbacks
instead of the same placeholder blob. The **Unfamiliar story stress test** demo
fixture proves this flow without using existing story tags or canonical assets.

The quality ladder, generalization safeguards and honest boundary between
runtime fallback art and reviewed hero assets are documented in
`docs/universal-visual-quality.md`.

The **Universal world families** fixture expands that same data-driven renderer
to snowy alpine routes, deserts, coasts, meadows, urban markets and industrial
science-fiction interiors. Each family has its own terrain or architectural
grammar, atmospheric profile and deterministic presentation-only dressing.

## Portable story packages

The **Import story package** control accepts one validated `.json` handoff and
adds it to the fixture selector without application code changes. The package
contains an initial snapshot plus ordered story moments, each with passage text,
an optional new visual plan, and a patch from the previous moment. Built-in
stories pass through the same loader during startup.

The contract and ordering rules are documented in
`docs/story-package.md`. A third data-only regression world is available at
`fixtures/story_package_import_demo.json`; importing it creates the observatory
archive and its 5/5 approved-asset recipe even though React never imports that
fixture.

## Live Part 1 passage API

The **Live Part 1 connection** panel posts passage text to the frozen teammate
endpoint and incrementally updates the same mounted `WorldViewer`. It verifies
story/passage identity, ordered patch versions and patch-to-snapshot equivalence
before accepting an update. Opening responses require the companion
`visual_plan`; unchanged visual context may carry across later passages.

Run `pnpm part1:mock` for a local three-passage integration proof, then use the
panel defaults. The real-provider response contract and continuity rules are in
`docs/part1-live-adapter.md`.

## Asynchronous scene builds

`AsyncSceneBuildOrchestrator` owns the Part 2 lifecycle from a validated scene
recipe to a cached ready manifest. Approved assets resolve first; remaining hero
jobs move through queued, generating and reviewing states. A generated candidate
cannot enter the manifest until that exact artifact has been previewed in-world
and approved.

Open **Part 2 scene-build diagnostics** to exercise this boundary with the
deterministic mock provider. The mock verifies orchestration and is not a
production art source. Architecture, provider and Member 3 ownership details are
documented in `docs/async-scene-build.md`.

The optional companion inspector consumes the same current snapshot and controlled selection:

```tsx
<EntityInspector
  snapshot={currentSnapshot}
  selectedEntityId={selectedEntityId}
  onEntitySelect={setSelectedEntityId}
/>
```

The `snapshot` initializes the mounted scene. A new `patch` is applied only when its `fromVersion` matches the scene's current version. Consumers should send patches in order. Supplying a new snapshot version re-synchronizes the viewer. `activeLocationId` is optional and defaults to the first location; changing it switches the mounted room without replacing the current world state.

## Streaming integration

`useWorldStream` bridges a WebSocket or event stream to the viewer without allowing burst, stale or out-of-order patches to skip a version:

```tsx
const stream = useWorldStream(initialSnapshot);

useEffect(() => {
  socket.onmessage = ({ data }) => {
    const packet = JSON.parse(data);
    if (packet.type === "snapshot") stream.resynchronize(packet.snapshot);
    if (packet.type === "patch") stream.ingestPatch(packet.patch);
  };
}, [socket, stream.ingestPatch, stream.resynchronize]);

<WorldViewer
  snapshot={stream.snapshot}
  patch={stream.patch}
  onPatchApplied={stream.onPatchApplied}
  selectedEntityId={selectedEntityId}
  onEntitySelect={setSelectedEntityId}
/>

<EntityInspector
  snapshot={stream.currentSnapshot}
  selectedEntityId={selectedEntityId}
  onEntitySelect={setSelectedEntityId}
/>
```

When `stream.status === "resync_required"`, request a fresh snapshot from the backend and pass it to `stream.resynchronize(...)` before accepting more patches.

## Commands

```bash
pnpm install
pnpm setup:integrated
pnpm dev:integrated
pnpm check:integrated
pnpm build:integrated
pnpm contracts:generate
pnpm models:generate
pnpm triposr:setup
pnpm triposr:serve
pnpm triposr:prove
pnpm part1:mock
pnpm dev
pnpm test
pnpm build
pnpm bundle:check
pnpm verify
```

The public integration surface is exported from `src/index.ts`. The exact Member
3 import boundary, callback ownership, deployment assets and acceptance checklist
are in `docs/member-3-handoff.md`; `pnpm handoff:check` verifies the contract from
a consumer's point of view. Fixture JSON lives in `fixtures/` and does not depend
on Member 1's extraction service.

## Member 1 narrative engine

Member 1's pipeline converts literary passages into a persistent semantic world
model for the 3D renderer. GPT-5.6 Terra extracts evidence-linked observations;
deterministic Python code owns entity IDs, state changes, conflicts, and files.

### Pipeline

```text
passage text
  -> sentence IDs
  -> GPT-5.6 Terra constrained extraction
  -> deterministic entity resolution
  -> snapshot reconciliation and conflict detection
  -> versioned snapshot + scene patch + conflicts
```

The LLM never produces coordinates or asset paths. Internal artifacts retain
evidence-rich snake-case fields, while the HTTP API translates them into the
camelCase contract validated by Member 2.

The current MVP deliberately keeps one persistent renderer location. Later
rooms or corridors become architectural entities in that scene. Renderer-facing
relations are limited to `left_of`, `right_of`, `in_front_of`, `behind`, `near`,
`on`, `inside`, `against_wall`, and `centered`.

The team has also chosen an environment-only MVP: Member 1 does not extract or
emit characters for rendering. Character actions may motivate object changes in
the prose, but people and character-to-object spatial relations are omitted from
snapshots, patches, and visual plans.

### Setup

Create a virtual environment and install the project:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
```

Create `.env` from the provided template and add your API key. `.env` is ignored
by Git and loaded automatically:

```powershell
Copy-Item .env.example .env
# Edit .env and replace OPENAI_API_KEY=replace_me with your real key.
```

`STORYWORLD_MODEL` is optional because `gpt-5.6-terra` is already the default.
Process environment variables still override values loaded from `.env`.

### Process the four demo passages

Run these in order so every passage updates the previous snapshot:

```powershell
python -m storyworld.cli process --story-id study-demo --passage-id P1 --file passage_1.txt
python -m storyworld.cli process --story-id study-demo --passage-id P2 --file passage_2.txt
python -m storyworld.cli process --story-id study-demo --passage-id P3 --file passage_3.txt
python -m storyworld.cli process --story-id study-demo --passage-id P4 --file passage_4.txt
```

To exercise imported text through the complete Member 1 → Member 2 → Member 3
UI path, follow the live two-terminal instructions in
`docs/integrated-quick-start.md`. Prepared library stories remain fixture-backed;
imported stories call Member 1 when `VITE_STORYWORLD_API_URL` is configured.

Print the most recent snapshot:

```powershell
python -m storyworld.cli latest --story-id study-demo
```

Generated artifacts are stored under:

```text
data/study-demo/
  sentences/
  extractions/
  snapshots/
  patches/
  conflicts/
```

To replay a previously cached model extraction during a demo:

```powershell
python -m storyworld.cli process --story-id study-demo --passage-id P2 --file passage_2.txt --replay-cached-extraction
```

### Run the API

```powershell
uvicorn storyworld.api:app --reload
```

Main endpoint:

```http
POST /api/stories/{story_id}/passages
Content-Type: application/json

{
  "passage_id": "P1",
  "text": "The current story passage...",
  "replay_cached_extraction": false
}
```

Supporting endpoints:

```text
GET /health
GET /api/stories/{story_id}/snapshots/latest
```

Interactive API documentation is available at `http://127.0.0.1:8000/docs`.
The opening response omits its patch and includes `visual_plan`; later responses
include an ordered `ScenePatch` that reproduces the supplied camelCase snapshot.
Development CORS defaults allow the integrated UI on ports 8443 and 5173 and
can be overridden with `STORYWORLD_CORS_ORIGINS`.

### Tests

The tests use curated extractions rather than the live API, so they consume no
credits and remain deterministic:

```powershell
python -m unittest discover -s tests -v
```

They verify that:

- Passage 1 establishes the study.
- Passage 2 reuses IDs and moves the armchair.
- Passage 3 discovers the hidden doorway and corridor.
- Passage 4 preserves the established desk position and records a conflict.
- The OpenAI call uses `gpt-5.6-terra` with `ExtractionResult` as its constrained
  Pydantic output schema.

#### Optional live evaluation

The live evaluator sends all four passages to the configured model, scores the
handoff requirements, and writes internal artifacts plus Member 2-compatible
responses to an ignored test directory. It uses API credits, so choose a new
directory for each run:

```powershell
python scripts/run_live_evaluation.py --data-dir test_runs/live_eval --story-id study-live-eval
```

The summary is saved as
`test_runs/live_eval/study-live-eval/evaluation_report.json`.

### Main code locations

- `storyworld/models.py`: constrained extraction, snapshot, patch, and conflict schemas.
- `storyworld/extractor.py`: GPT-5.6 Terra prompt and Responses API call.
- `storyworld/handoff.py`: deterministic translation into the shared main contract.
- `storyworld/handoff_models.py`: camelCase snapshot, patch, conflict, and visual-plan schemas.
- `storyworld/resolver.py`: stable identity and alias resolution.
- `storyworld/reconciler.py`: deterministic state updates and conflicts.
- `storyworld/storage.py`: versioned JSON persistence and cached extractions.
- `storyworld/api.py`: FastAPI integration contract.
- `storyworld/cli.py`: local processing and demo commands.
