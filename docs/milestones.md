# Milestone history

Development history of the Part 2 spatial runtime, milestone by milestone.
This is a record of how the renderer reached its current state; for what the
project does and how to run it, see the [README](../README.md).

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

