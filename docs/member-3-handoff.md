# Member 3 spatial-runtime handoff

Member 3 can integrate the complete Part 2 runtime through one source entry:
`src/index.ts`. Do not import renderer internals directly. The public boundary is
covered by `src/integration/publicApi.test.tsx` and can be checked with
`pnpm handoff:check`.

The compile-checked reference integration is
`src/integration/Member3ConsumerHarness.tsx`.

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
- Feed patches through `useWorldStream`; handle `resync_required`.
- Keep canonical story, location, and entity IDs unchanged.
- Update the visual plan alongside its matching snapshot version.
- Wire passage advance and location requests so they also work in fullscreen walk mode.
- Show runtime errors in the product shell and offer retry/resynchronization.
- Before release, run the complete `pnpm verify` gate.
