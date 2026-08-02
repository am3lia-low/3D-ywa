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

## Component contract

```tsx
<WorldViewer
  snapshot={snapshot}
  patch={patch}
  selectedEntityId={selectedEntityId}
  onEntitySelect={handleEntitySelect}
/>
```

The `snapshot` initializes the mounted scene. A new `patch` is applied only when its `fromVersion` matches the scene's current version. Consumers should send patches in order. Supplying a new snapshot version re-synchronizes the viewer.

## Commands

```bash
pnpm install
pnpm models:generate
pnpm dev
pnpm test
pnpm build
```

The public integration surface is exported from `src/index.ts`. Fixture JSON lives in `fixtures/` and does not depend on Member 1's extraction service.
