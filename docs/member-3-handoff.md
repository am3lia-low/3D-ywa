# Member 3 spatial-runtime handoff

Read `docs/team-integration-contract.md` first for the authoritative three-member
input/output boundary. This file expands the Member 3 implementation details.

Member 3 can integrate the complete Part 2 runtime through one source entry:
`src/index.ts`. Do not import renderer internals directly. The public boundary is
covered by `src/integration/publicApi.test.tsx` and can be checked with
`pnpm handoff:check`.

The compile-checked reference integration is
`src/integration/Member3ConsumerHarness.tsx`.

## Integration with `origin/wyf`

The current Member 3 branch contains a useful reader shell, but its
`Create UI Prototype for Hackathon/src/components/WorldViewer.tsx` is an SVG
mock and its local `WorldSnapshot` / `ScenePatch` types are screen-specific
placeholders. Do not translate the factual 3D contract into 2D `x`, `y`, and
`radius` entities. Replace that boundary with imports from `src/index.ts` while
retaining the reader, timeline, loading, conflict, and comparison UI.

The integrated `ChapterProcessingResult` must carry the real values returned by
Part 1 plus the companion visual plan:

```ts
interface ChapterProcessingResult {
  chapterId: string;
  snapshot: WorldSnapshot;
  patch: ScenePatch | null;
  visualPlan: VisualScenePlan;
  conflicts: Conflict[];
  summary: ChapterUpdateSummary;
}
```

Member 3's `highlightedEntityIds` remains product UI state. The authoritative
added/moved/updated transition comes from `ScenePatch.operations`; do not build
a second patch format from those highlight IDs. Recipe compilation alone is not
a readiness signal. Set the reader's ready state only from `WorldViewer`'s
`onSceneReady`, after the active location's loader queue settles and rendered
frames complete; wire `onSceneError` to `WorldViewer.onRuntimeError`.

Recommended merge order:

1. Keep Member 3's application shell and delete only its SVG mock viewer.
2. Replace the simplified world types in its `src/types.ts` with imports from
   Part 2's public entry point.
3. Replace the mock API payload with the real Part 1 response plus
   `VisualScenePlan`.
4. Feed sequential patches through `useWorldStream`; on a version gap fetch a
   full snapshot and call `resynchronize`.
5. Mount the compile-checked harness pattern below inside the existing Explore
   panel, then retain the reader's inspector/provenance chrome around it.
6. Copy `public/models`, `public/textures`, and `public/generated` into the
   final application unchanged.

## Minimal reader integration

From a product component beneath `src/`, adjust only the relative path to
`src/index.ts`:

```tsx
import { useState } from "react";
import {
  EntityInspector,
  WorldViewer,
  compileSceneRecipe,
  useWorldStream,
  type VisualScenePlan,
  type WorldSnapshot,
} from "../index";

export function ExploreScene({
  initialSnapshot,
  visualPlan,
  advancePassage,
}: {
  initialSnapshot: WorldSnapshot;
  visualPlan: VisualScenePlan;
  advancePassage: () => void;
}) {
  const stream = useWorldStream(initialSnapshot);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const recipe = compileSceneRecipe(stream.currentSnapshot, visualPlan);

  return (
    <>
      <WorldViewer
        snapshot={stream.snapshot}
        patch={stream.patch}
        visualPlan={visualPlan}
        sceneRecipe={recipe}
        assetRegistry={recipe.assetRegistry}
        selectedEntityId={selectedEntityId}
        onEntitySelect={setSelectedEntityId}
        onPatchApplied={stream.onPatchApplied}
        onPassageAdvance={advancePassage}
        onLocationRequest={(locationId) => navigateToLocation(locationId)}
        onRuntimeError={(error) => showRecoveryMessage(error.message)}
      />
      <EntityInspector
        snapshot={stream.currentSnapshot}
        selectedEntityId={selectedEntityId}
        onEntitySelect={setSelectedEntityId}
      />
    </>
  );
}
```

The reader's API or WebSocket adapter feeds validated updates into
`stream.ingestPatch(patch)`. If its result is `resync_required`, fetch a fresh
snapshot and call `stream.resynchronize(snapshot)`. Never skip versions or set
`patch` back to `null` manually while an update is being applied.

`recipe.assetOutcomes` contains one reader-safe asset result per canonical
entity. Member 3 may summarize its counts as “Preparing optional scene details”
while still enabling Explore: approved assets, designed fallbacks, queued work,
review, failure and rejection are all renderable states. Provider controls,
candidate review and `pnpm assets:promote` remain internal Member 2 tooling and
must not appear in the reader UI.

## Ownership of viewer props

| Prop | Owner | Rule |
| --- | --- | --- |
| `snapshot` | stream binding | Initializes or explicitly resynchronizes the world. |
| `patch` | stream binding | Must be the next ordered patch only. |
| `visualPlan` | passage/timeline UI | Use the plan matching the active snapshot version. |
| `sceneRecipe` | product integration | Compile from the active snapshot and visual plan. |
| `assetRegistry` | compiled recipe | Pass `recipe.assetRegistry`; custom registries are optional. |
| `selectedEntityId` | reader UI | Controlled selection shared with the inspector. |
| `onEntitySelect` | reader UI | Updates controlled selection; `null` clears it. |
| `onPatchApplied` | stream binding | Acknowledges the patch and releases the next queued patch. |
| `activeLocationId` | reader/navigation UI | Optional; defaults to the first snapshot location. |
| `onLocationRequest` | reader/navigation UI | Receives a canonical destination location ID from doors or portals. |
| `onPassageAdvance` | timeline UI | Makes passage progression available inside fullscreen walk mode. |
| `onRuntimeError` | product shell | Show recovery UI and request resynchronization when appropriate. |

For two or more connected locations, Member 1 supplies the canonical locations,
door entity, and `VisualScenePlan.presentationConnections`. Member 2 owns the
clickable portal and spatial transition. Member 3 only preserves the controlled
`activeLocationId` (or uses the included Member 3 adapter) and keeps the warmed
canvas mounted across Reading -> Explore. See
[`multi-location-traversal.md`](multi-location-traversal.md) for the complete
input skeleton, ownership table, validation rules, and Ashwood Chapter 3 test.

## Real scene preparation and readiness

The integrated `wl` shell's **Preparing the 3D scene...** state is not a timer.
For each chapter it keeps one hidden, on-demand canvas mounted and performs this
sequence:

1. validate and compile the snapshot, patch, and visual plan;
2. mount the compiled room and begin actual model/texture loading;
3. wait for the R3F loader queue to settle and render two frames;
4. repeat the warm-up for every canonical location in the chapter;
5. fire `onSceneReady`, mark the chapter ready, and reveal the same warmed
   canvas when the reader chooses Explore.

Do not report ready from API completion, a fixed delay, or recipe compilation.
Do not unmount the warm canvas between the reader and 3D views. A runtime error
must instead enter Member 3's retry/recovery state.

## Story provenance in the object inspector

Selectable story entities retain Member 1's canonical ID and provenance. Member
3 should show the active book title, originating or latest-updated chapter,
`provenance.sentence`/`sourceSentence`, confidence, and evidence classification.
Decorative-only dressing must not claim novel provenance. The integrated
inspector already presents this as **From the story** and **Passage evidence**;
it does not generate an unsupported description in the browser.

The spatial runtime owns rendering, deterministic placement, scene transitions,
walk/overview controls, fullscreen behavior, exit interaction, and object picking.
It does not own passage fetching, reader chronology, route changes, loading UI,
or user-facing error recovery.

## Accepted data flows

For a complete data-only handoff, call `runtimeStoryFromPackage(input)` or
`parseStoryPackageJson(json)`. Both validate the frozen factual contracts,
visual-plan joins, version continuity, and scene executability. Imported packages
with blocking composition faults are rejected.

Call `preflightStoryPackage(input)` before offering a generated story to the
reader. `status: "ready"` means every compiled moment is clean;
`status: "needs_review"` means it remains executable but has review warnings.

For direct Part 1 API integration, `LivePart1StorySession` validates passage
responses and preserves snapshot/patch continuity. Member 3 still owns the HTTP
request and loading experience.

## Static asset deployment

Keep these directories from this repository at the deployed web root:

- `public/models/`
- `public/textures/`
- `public/generated/`

Catalog URLs are root-relative (for example `/models/lantern.glb`). A standard
Vite build from this repository copies them automatically. If Member 3 moves the
viewer into another application, copy all three directories unchanged or serve
equivalent files at the same paths. Missing files safely fall back where
possible, but visual quality will degrade.

Do not expose ComfyUI or TripoSR to the browser. They are optional offline asset
production providers; only reviewed, promoted artifacts belong in the runtime
registry and deployment.

## Handoff checklist

- Import all consumer APIs from `src/index.ts`.
- Run `pnpm handoff:check`.
- Run `pnpm scenes:preflight` for all built-in story moments.
- Run `pnpm assets:validate` and retain the three public asset directories.
- Retain `src/data/promoted-story-assets.json`; its story-specific entries point
  to reviewed artifacts beneath `public/generated/promoted/`.
- Feed patches through `useWorldStream`; handle `resync_required`.
- Keep canonical story, location, and entity IDs unchanged.
- Update the visual plan alongside its matching snapshot version.
- Wire passage advance and location requests so they also work in fullscreen walk mode.
- Show runtime errors in the product shell and offer retry/resynchronization.
- Before release, run the complete `pnpm verify` gate.

## Integrated prototype on `wl`

The `wl` branch contains Member 3's application under
`Create UI Prototype for Hackathon/`, connected to Part 2 through the
`@spatial-runtime` alias. The complete fresh-clone and troubleshooting guide is
[`integrated-quick-start.md`](integrated-quick-start.md). From the repository
root, run:

```powershell
pnpm setup:integrated
pnpm dev:integrated
```

Then open `http://127.0.0.1:8443/`. The prepared-story mock service emits both
Member 3's inspector view model and the canonical spatial snapshot/visual plan.
`src/spatial/mockSpatialAdapter.ts` is development scaffolding only; a real
Member 1 response should populate `spatialSnapshot`, `spatialPatch`, and
`visualPlan` directly without passing through that adapter.

The integration boundary is implemented in:

- `Create UI Prototype for Hackathon/src/components/WorldViewer.tsx`
- `Create UI Prototype for Hackathon/src/spatial/mockSpatialAdapter.ts`
- `Create UI Prototype for Hackathon/src/types.ts`
- `Create UI Prototype for Hackathon/src/api/mockApi.ts`
