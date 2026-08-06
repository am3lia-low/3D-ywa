# Data-driven scene composition

`compileSceneRecipe(snapshot, visualPlan)` is the single boundary between
narrative state and the reusable 3D scene grammar. Canonical entities and
relations remain in `WorldSnapshot`; architecture, atmosphere and decorative
density come from the companion `VisualScenePlan`.

## Scene grammar

Visual tags select only registered modules. Current environment families cover:

- timber-and-plaster attic interiors;
- archive shelving and stone floors;
- iron-and-glass botanical conservatories;
- open-air masonry courtyards with cobbles and arcades;
- stylized fantasy woodlands with semantic conifer/broadleaf balance, painted
  forest floors, winding earth trails, layered CC0 foliage and soft boundaries.

Dressing modules are presentation-only. Books, storage clusters, planters,
ivy, puddles, leaf litter and courtyard clutter improve composition but never
become persistent narrative facts or canonical entity IDs. Approved scenery
uses the same path: `broadleaf-trees`, `hedges` and `verge-rocks` select the
catalogued nature assets and deterministic approach slots. Removing a tag from
the next visual-plan version removes only that decorative set.

Grounded interior prose now expands into reusable `period-interior` composition
rather than the authored estate room. Optional `writing-room`, `reading-nook`,
`parlor`, `mantel-display` and `wall-gallery` signals enrich compatible rooms
with approved furniture and props. Each resolved decorative instance records a
`placementAnchor` of `floor`, `wall`, `surface` or `ceiling`. Surface props also
record the canonical or decorative `supportId`; the resolver measures the real
support height, searches bounded tabletop slots and skips a prop when it cannot
place it without collision. Only an explicit `estate-furnishings` tag selects
the hand-authored estate composition.

Specialized interior prose is classified before that generic period rule.
`tavern-interior`, `nautical-interior`, `bedroom-interior` and
`modern-interior` prevent unrelated domestic furniture from leaking into a
taproom, signal room, ship cabin, bedchamber or contemporary office. The first
three currently select purpose-specific approved clusters (tables and barrels,
nautical storage and lanterns, or bedside storage and lighting). Modern rooms
remain intentionally sparse until an approved modern PBR kit is added; the
runtime will not disguise historical furniture as contemporary assets.

`fixtures/interior_scene_stress_cases.json` is the coverage matrix for this
classifier. It exercises a coastal signal room, harbor tavern, old bedchamber,
captain's cabin, modern office and fantasy study and asserts both required and
forbidden module tags, decorative density and stable presentation-only IDs.

Exterior slots deliberately live in the recipe's `approach` placement region,
outside the canonical location bounds but inside the walkable presentation
ground. They remain `decorativeOnly`, retain stable IDs across patches, and do
not mint trees or rocks into `WorldSnapshot`.

Woodland recipes use the bounded `woodland` placement region. Semantic tags for
pine trees, undergrowth, grass, fungi, deadwood and forest rocks resolve to the
active approved style kit. The renderer never receives model URLs from Part 1.
`GhibliWoodlandKit` then seeds the decorative arrangement from canonical
`locationId` plus the visual description, mood, time and sorted tags. It does not
accept `storyId`, and it reserves the path corridor before placing scenery.

## Atmosphere and lighting

`createSceneAtmosphereProfile(presentation, bounds)` converts the visual plan's
time of day, palette, weather effects, warmth and contrast into a deterministic
renderer-owned light rig. The profile classifies the compiled module set as an
interior, glasshouse, courtyard or woodland and selects bounded fog, exposure,
key/fill direction and ground-contact treatment for that family.

Open environments use a camera-following skydome, so overview and extended
walking views cannot reveal a finite sky boundary. Ground mist is a POV/Walk
effect and remains hidden from the authorial overview, while enclosed scenes use
soft contact shadows to keep furniture visually planted without projecting a
shadow plane across exterior terrain.

## Composition audit

Every compiled recipe now includes a deterministic `composition` report. The
audit runs against the exact coordinates and dimensions used by `WorldViewer`
and checks:

- entity overlap and implausible scale;
- unsupported or floating objects;
- furniture facing its related object;
- clear access zones in front of doors and gates;
- adequate visual coverage for locations requesting rich dressing.

Errors mark the report `blocking`; warnings mark it `review`; an issue-free
scene is `clean`. The app exposes the resulting score beside the recipe status.
This is a quality signal, not narrative truth, and does not modify the snapshot.

`pnpm scenes:preflight` compiles every built-in story moment and fails if any
composition is blocking. Imported story packages pass through the same gate
before becoming a `RuntimeStory`, so blocking scenes never mount in the viewer.

Approved safe meshes receive generated center-support measurements in
`src/data/safe-mesh-support.json`. `pnpm assets:support:generate` refreshes the
file from mesh triangles, while `pnpm assets:support:check` fails when it is
stale. Irregular relation targets such as logs, rocks and barrels require a
measured support height; a missing measurement is itself a blocking preflight
error.

## Generalization proof

The rain-washed courtyard fixture is intentionally unlike the two interior
fixtures. Its snapshot and patch use the frozen interfaces, while its visual
plan selects an open-air shell, smaller wet cobbles, plastered masonry arcades,
ivy, rain, puddles, approved approach vegetation and decorative coaching-yard
clusters. Passage two moves the
chair, lights a surface-mounted lantern, unlocks the gate and adds a map without
rebuilding the environment.

The Mosswood fixture then provides a second open-air proof with no courtyard
architecture: its visual plan selects a cool conifer-heavy woodland composition.
Its factual lantern, fallen cedar, mushroom ring and waystone retain canonical
snapshot identities. The unrelated Sunbell fixture selects a warm broadleaf and
flower-grove variation from the same code. Its second passage proves that factual
object patches do not reseed or rearrange decorative woodland dressing.

The same mechanism applies to imported story packages. Adding another biome or
architectural family requires registering renderer modules and tags, not adding
story-specific branching to the application shell.
