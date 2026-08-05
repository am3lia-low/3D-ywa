# Team integration contract

To run the combined Member 3 reader and Member 2 renderer from a fresh clone,
follow [`integrated-quick-start.md`](integrated-quick-start.md). This document
remains the authoritative ownership and data-contract reference.

This is the authoritative handoff document for the three project members. If a
fixture, UI mock, or older note disagrees with this file, the exported schemas
and validators in `src/index.ts` win.

## End-to-end boundary

```text
Member 1: passage -> factual snapshot + ordered patch + visual plan
                         |
                         v
Member 2: validate -> compose -> resolve assets -> render WorldViewer
                         |
                         v
Member 3: reader UI -> loading/retry -> timeline -> inspector -> deployment
```

The boundary is data-driven. Member 1 never needs to author coordinates for a
good default scene, Member 2 never parses the novel, and Member 3 never rebuilds
spatial state or placement logic.

## Ownership matrix

| Concern | Owner | Input | Output |
| --- | --- | --- | --- |
| Passage segmentation and extraction | Member 1 | `storyId`, `passageId`, passage text, previous factual state | `WorldSnapshot`, `ScenePatch`, conflicts, processing summary |
| Visual interpretation from prose | Member 1 | Selected passage plus relevant novel context | Versioned `VisualScenePlan` using canonical IDs |
| Persistence and contradiction handling | Member 1 | Ordered passage observations | Authoritative post-passage snapshot and conflict records |
| Spatial composition | Member 2 | Valid snapshot, matching visual plan, optional next patch | Deterministic layout, scene recipe, composition report |
| Assets and 3D runtime | Member 2 | Semantic entity descriptions and asset tags | Approved asset registry, fallbacks, transitions, `WorldViewer` |
| Reader experience and transport | Member 3 | Part 1 HTTP responses and Part 2 public exports | Reading/timeline UI, loading and retry states, inspector, deployment |

## Source-of-truth files

| Contract | Human-readable source | Runtime validator / proof |
| --- | --- | --- |
| `WorldSnapshot`, `ScenePatch` | `src/contracts/world.ts` | `src/contracts/validation.ts` |
| `VisualScenePlan` | `src/contracts/visualScenePlan.ts` | `VisualScenePlanSchema` in `src/integration/storyPackage.ts` |
| Batch `StoryPackage` | `docs/story-package.md` | `validateStoryPackage` |
| Live Part 1 response | This document and `docs/part1-live-adapter.md` | `LivePart1StorySession` |
| Member 3 renderer API | `src/components/WorldViewer.tsx` | `src/integration/publicApi.test.tsx` |
| Complete consumer example | `src/integration/Member3ConsumerHarness.tsx` | `pnpm handoff:check` |

Member 3 must import runtime types and components from `src/index.ts`, not from
internal renderer modules.

## Member 1 output

### Live endpoint

```http
POST /api/stories/{story_id}/passages
Content-Type: application/json

{
  "passage_id": "P2",
  "text": "The selected passage text."
}
```

The response is the authoritative state after processing that passage:

```ts
interface Part1PassageResponse {
  snapshot: WorldSnapshot;
  patch?: ScenePatch | null;
  conflicts?: Conflict[];
  processing_summary?: {
    entities_added?: number;
    entities_moved?: number;
    entities_updated?: number;
  };
  visual_plan?: VisualScenePlan;
}
```

`visualPlan` and `visual_scene_plan` are accepted compatibility aliases, but
`visual_plan` is the recommended serialized name.

### Opening response

- `snapshot.storyId` must equal the URL `story_id`.
- `snapshot.passageId` must equal the request `passage_id`.
- The opening response must contain a `visual_plan`.
- `patch` is omitted or `null` because there is no previous version.
- `snapshot` contains at least one location; empty entity/relation/conflict
  arrays are valid.

Minimal shape:

```json
{
  "snapshot": {
    "storyId": "story-example",
    "version": 1,
    "passageId": "P1",
    "locations": [{ "id": "room-1", "name": "Signal room", "bounds": [16, 6, 18] }],
    "entities": [{
      "id": "lantern-1",
      "name": "Brass watch lantern",
      "kind": "light",
      "assetKey": "lantern",
      "locationId": "room-1",
      "dimensions": [0.3, 0.55, 0.3],
      "state": { "lit": true }
    }],
    "relations": [],
    "conflicts": []
  },
  "patch": null,
  "conflicts": [],
  "processing_summary": {
    "entities_added": 1,
    "entities_moved": 0,
    "entities_updated": 0
  },
  "visual_plan": {
    "schemaVersion": "1.0",
    "storyId": "story-example",
    "segmentId": "segment-P1",
    "sourcePassageIds": ["P1"],
    "snapshotVersion": 1,
    "planVersion": 1,
    "artDirection": {
      "styleLabel": "realistic stylized maritime fantasy",
      "stylePrompt": "Weathered coastal signal room, crafted materials, readable silhouettes",
      "negativePrompt": ["flat primitives", "floating props", "modern plastic"],
      "materialVocabulary": ["aged oak", "patinated brass", "salt-worn plaster"]
    },
    "locations": [{
      "locationId": "room-1",
      "archetype": "coastal signal room",
      "visualDescription": "A working signal room above a fogbound harbor.",
      "architectureTags": ["interior", "plaster-walls", "timber-floor"],
      "dressingTags": ["navigation-tools", "brass-lighting"],
      "dressingDensity": "rich",
      "mood": "watchful and weathered",
      "timeOfDay": "night",
      "palette": {
        "background": "#0f2027",
        "fog": "#789097",
        "floor": "#47372d",
        "wall": "#8b8175",
        "timber": "#4c3023",
        "ambient": "#9eb7ba",
        "keyLight": "#b8d8df",
        "practical": "#efb766"
      },
      "lighting": {
        "warmth": "warm",
        "contrast": "medium",
        "ambientIntensity": 0.65,
        "keyIntensity": 1.3,
        "atmosphericEffects": ["window fog", "dust motes"]
      },
      "evidence": {
        "passageIds": ["P1"],
        "confidence": 0.9,
        "basis": "explicit_text"
      }
    }],
    "entities": [{
      "entityId": "lantern-1",
      "visualDescription": "A hand-worn brass storm lantern with warm glass.",
      "importance": "hero",
      "materials": ["patinated brass", "smoked glass"],
      "colors": ["antique gold", "warm amber"],
      "condition": "well-used and salt-weathered",
      "assetSearchTags": ["antique brass storm lantern", "maritime lantern"],
      "evidence": {
        "passageIds": ["P1"],
        "confidence": 0.9,
        "basis": "explicit_text"
      }
    }],
    "presentationConnections": [],
    "unresolvedQuestions": []
  }
}
```

### Later response

- `patch` is required.
- `patch.fromVersion` equals the previously accepted snapshot version.
- `patch.toVersion` is greater than `fromVersion` and equals the new snapshot
  version.
- Applying the patch to the previous snapshot must reproduce the response
  snapshot's locations, entities, and relations exactly.
- A new `visual_plan` is optional when the visual context has not changed. The
  last valid plan carries forward.
- If a new plan is supplied, its `planVersion` increases and
  `previousPlanVersion` points to the preceding emitted plan.

```json
{
  "snapshot": {
    "storyId": "story-example",
    "version": 2,
    "passageId": "P2",
    "locations": [{ "id": "room-1", "name": "Signal room", "bounds": [16, 6, 18] }],
    "entities": [{
      "id": "lantern-1",
      "name": "Brass watch lantern",
      "kind": "light",
      "assetKey": "lantern",
      "locationId": "room-1",
      "dimensions": [0.3, 0.55, 0.3],
      "state": { "lit": false }
    }],
    "relations": [],
    "conflicts": []
  },
  "patch": {
    "fromVersion": 1,
    "toVersion": 2,
    "operations": [
      { "op": "update_entity", "entityId": "lantern-1", "changes": { "state": { "lit": false } } }
    ]
  },
  "conflicts": [],
  "processing_summary": {
    "entities_added": 0,
    "entities_moved": 0,
    "entities_updated": 1
  }
}
```

`processing_summary` is informational UI metadata. The patch and authoritative
snapshot, not the summary counts, control world state. Conflicts are transported
in parallel because the frozen patch operations do not mutate conflict records.

### Factual state rules

- Preserve `storyId`, location IDs, entity IDs, and relation IDs across
  passages. Aliases do not replace canonical IDs.
- `WorldSnapshot` contains narrative facts only. Decorative filler belongs in
  `VisualScenePlan.locations[].dressingTags`.
- Every entity references an existing `locationId`.
- Every relation subject/object references an existing entity.
- `centered` and `against_wall` may omit `objectId`; other relations require it.
- `against_wall` should include `metadata.wall` with `north`, `south`, `east`,
  or `west`.
- `dimensions` are `[width, height, depth]` and must be positive when supplied.
- `transform.position` and `move_entity.position` use `[x, y, z]` in meters.
  Omit invented coordinates when only semantic relations are supported; Member
  2 will compose a deterministic layout.

### Visual-plan rules

- `VisualScenePlan.storyId` must match the snapshot.
- Every visual `locationId` and `entityId` must already exist in factual state.
- The exact lighting enums are:
  - `warmth`: `cool`, `neutral`, or `warm`
  - `contrast`: `low`, `medium`, or `high`
- `dressingDensity` is `sparse`, `moderate`, or `rich`.
- Entity importance is `background`, `supporting`, or `hero`.
- Evidence basis is `explicit_text`, `cross_passage_inference`, or
  `art_direction_default`.
- CSS hex colors such as `#8b8175` are the safest palette values.
- Unknown assets should use strong `visualDescription`, materials, colors, and
  `assetSearchTags`. Do not invent a canonical asset ID.

## Member 2 input and output

Member 2 validates all Member 1 data before rendering. Its public output is a
component and callbacks, not a second world-state format.

```tsx
const recipe = compileSceneRecipe(currentSnapshot, visualPlan);

<WorldViewer
  snapshot={stream.snapshot}
  patch={stream.patch}
  visualPlan={visualPlan}
  sceneRecipe={recipe}
  assetRegistry={recipe.assetRegistry}
  selectedEntityId={selectedEntityId}
  onEntitySelect={setSelectedEntityId}
  onPatchApplied={stream.onPatchApplied}
  onLocationRequest={navigateToLocation}
  onPassageAdvance={advancePassage}
  onRuntimeError={showRuntimeError}
/>
```

Member 3 may also pass the optional `resetToken` prop when the reader explicitly
restarts the same story snapshot. Changing the token resets spatial runtime state
without unmounting the WebGL canvas. Ordinary passage patches and location travel
must not change it.

Member 2 outputs to Member 3:

| Output | Meaning |
| --- | --- |
| Rendered `WorldViewer` | Persistent, explorable current world |
| `onEntitySelect(id)` | Canonical selected entity ID or `null` |
| `onPatchApplied(snapshot, patch)` | Patch transition completed; next patch may be released |
| `onLocationRequest(locationId)` | A door/portal requested canonical navigation |
| `onRuntimeError(error)` | Typed error for retry or resynchronization UI |
| `compileSceneRecipe(...).composition` | Preflight status, score, warnings, and blocking issues |

Member 2 owns coordinates, support surfaces, wall clearances, asset selection,
fallbacks, LODs, rendering, object picking, camera modes, and transitions. It
does not own passage order, HTTP requests, reader loading UI, or conflict review.

## Member 3 input and output

Member 3 owns transport and product state:

1. POST the selected passage to Member 1.
2. Validate/normalize the response with `LivePart1StorySession` or the exported
   validators.
3. Mount the opening snapshot and plan.
4. Send later patches through `useWorldStream().ingestPatch`.
5. When `onPatchApplied` fires, allow the stream to release its next patch.
6. If `ingestPatch` returns `resync_required`, fetch a fresh authoritative
   snapshot and call `resynchronize(snapshot)`.
7. Keep `selectedEntityId` in reader UI state and use it for the inspector.
8. Display loading, retry, conflict, provenance, and build-status UI outside the
   viewer.

Member 3 must deploy these directories at the web root:

- `public/models/`
- `public/textures/`
- `public/generated/`

Member 3 must not translate the world into the earlier SVG mock format or create
a second patch/highlight schema.

## Batch/offline handoff

For demos, cached stories, or asynchronous generation, Member 1 may serialize a
complete `StoryPackage` instead of serving live responses:

```ts
interface StoryPackage {
  schemaVersion: "1.0";
  packageId: string;
  label: string;
  initialSnapshot: WorldSnapshot;
  moments: Array<{
    passageId: string;
    text: string;
    patchFromPrevious?: ScenePatch;
    visualPlan?: VisualScenePlan;
    actionLabel?: string;
  }>;
}
```

Use `fixtures/part1_story_package_template.json` as the canonical editable
example. The opening moment has no patch and requires a plan; every later moment
requires a patch. Import and live modes feed the same runtime contracts.

## Failure and recovery

| Failure | Detected by | Required behavior |
| --- | --- | --- |
| Malformed snapshot/patch/plan | Part 2 adapter | Reject before mutating the mounted world; show field path |
| Story or passage mismatch | `LivePart1StorySession` | Reject response and keep current scene |
| Missing opening plan | `LivePart1StorySession` | Keep reader available; retry visual planning |
| Missing/out-of-order patch | `useWorldStream` | Enter `resync_required`; fetch authoritative snapshot |
| Blocking composition issue | `validateStoryPackage` / preflight | Reject package or hold scene for review |
| Missing approved asset | Part 2 asset pipeline | Render designed fallback; queue offline resolution |
| Generated asset failure | Part 2 build pipeline | Preserve fallback and expose retry/review status |
| Viewer runtime error | `onRuntimeError` | Member 3 shows recovery UI; never silently reset chronology |

## Acceptance commands

Before Member 1 hands off a fixture or live-response sample:

```bash
pnpm test
pnpm scenes:preflight
```

Before Member 2 hands the viewer to Member 3:

```bash
pnpm handoff:check
pnpm assets:validate
pnpm bundle:check
```

Before the team merges or records the final demo:

```bash
pnpm verify
```

`pnpm verify` is the release gate. It validates contracts, ordered updates,
scene composition, support metadata, asset kits, production build, and bundle
budget.

## Examples to use

- Editable one-passage Part 1 output:
  `fixtures/part1_story_package_template.json`
- Complete multi-passage package:
  `fixtures/story_package_import_demo.json`
- Opening factual state: `fixtures/snapshot_1.json`
- Ordered patches: `fixtures/patch_2.json`, `fixtures/patch_3.json`
- Opening/revised visual plans:
  `fixtures/visual_scene_plan_1.json`, `fixtures/visual_scene_plan_3.json`
- Compile-checked Member 3 consumer:
  `src/integration/Member3ConsumerHarness.tsx`
