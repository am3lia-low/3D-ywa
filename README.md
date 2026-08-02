# Persistent StoryWorld 3D — Spatial Runtime

Member 2's fixture-driven React Three Fiber runtime for turning versioned world-state JSON into a stable, explorable room.

## Milestone 1

- Preserves the proposal's frozen `WorldSnapshot`, `ScenePatch`, and `WorldViewer` surfaces.
- Adds renderer-owned nested entity, relation, transform and patch-operation types.
- Resolves explicit coordinates and semantic relations with deterministic collision correction.
- Applies ordered scene patches while retaining stable identity for untouched entities.
- Renders a selectable room with orbit controls, primitive asset registry, unknown-asset fallbacks and change transitions.
- Demonstrates three passages using the required fixture files.

## Milestone 2

- Pins resolved coordinates across versions, placing only added or explicitly moved entities.
- Preserves layout-item references for unaffected entities, including primitive fallbacks.
- Keeps removed entities as temporary exit nodes so they animate out before unmounting.
- Covers adversarial insertion, movement, removal and fixture progression with continuity tests.

## Milestone 3

- Loads project-owned low-poly GLB models through the semantic asset registry.
- Uses suspense placeholders while models load and per-entity primitive fallbacks on failure.
- Preserves selection and change highlighting across modeled and fallback assets.
- Generates all model files reproducibly with `pnpm models:generate`.

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
- Keeps navigation targets inside the active room and scales camera limits to each location.
- Provides a reset-view control that glides back to the room overview.

## Component contract

```tsx
<WorldViewer
  snapshot={snapshot}
  patch={patch}
  activeLocationId={activeLocationId}
  selectedEntityId={selectedEntityId}
  onEntitySelect={handleEntitySelect}
  onRuntimeError={handleRuntimeError}
/>
```

The `snapshot` initializes the mounted scene. A new `patch` is applied only when its `fromVersion` matches the scene's current version. Consumers should send patches in order. Supplying a new snapshot version re-synchronizes the viewer. `activeLocationId` is optional and defaults to the first location; changing it switches the mounted room without replacing the current world state.

## Commands

```bash
pnpm install
pnpm contracts:generate
pnpm models:generate
pnpm dev
pnpm test
pnpm build
```

The public integration surface is exported from `src/index.ts`. Fixture JSON lives in `fixtures/` and does not depend on Member 1's extraction service.
