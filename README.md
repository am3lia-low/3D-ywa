# Persistent StoryWorld 3D — Spatial Runtime

Member 2's fixture-driven React Three Fiber runtime for turning versioned world-state JSON into a stable, explorable room.

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

- Loads normalized glTF assets through the semantic registry, including web-sized CC0 Poly Haven PBR models for hero furniture.
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
  -> buildSceneManifest(...)
  -> resolved asset registry + architecture + palette + lighting + dressing
  -> WorldViewer (ready)
     or asynchronous asset-generation jobs (assets_pending)
        -> runSceneAssetWorker(provider, optimizer)
        -> updated ready manifest
```

Part 1 fixture targets:

- `fixtures/visual_scene_plan_1.json` — opening plan for world version 1.
- `fixtures/visual_scene_plan_3.json` — revised plan after the passage-3 reveal.

The shared TypeScript surface is `src/contracts/visualScenePlan.ts`. Renderer decisions are compiled in `src/runtime/sceneCompiler.ts`, while `src/runtime/sceneBuildPipeline.ts` resolves project/catalog assets under canonical entity IDs and emits explicit jobs for missing assets. Canonical story, location and entity IDs are checked before visual context is accepted; decorative presentation never mutates `WorldSnapshot`.

`ready` manifests can render immediately. For `assets_pending`,
`src/runtime/sceneAssetWorker.ts` executes jobs concurrently, calls a supplied
search/generation provider, optionally optimizes each result and registers it
under the existing canonical entity ID. Failed jobs stay in the manifest for a
retry. A production deployment still needs one backend adapter containing the
chosen provider SDK and credentials; the provider-neutral orchestration is
implemented and tested here.

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
pnpm contracts:generate
pnpm models:generate
pnpm dev
pnpm test
pnpm build
pnpm bundle:check
pnpm verify
```

The public integration surface is exported from `src/index.ts`. Fixture JSON lives in `fixtures/` and does not depend on Member 1's extraction service.
