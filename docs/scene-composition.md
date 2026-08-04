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
- misted woodland paths with painted forest floor, winding earth trails and
  soft terrain boundaries.

Dressing modules are presentation-only. Books, storage clusters, planters,
ivy, puddles, leaf litter and courtyard clutter improve composition but never
become persistent narrative facts or canonical entity IDs. Approved scenery
uses the same path: `broadleaf-trees`, `hedges` and `verge-rocks` select the
catalogued nature assets and deterministic approach slots. Removing a tag from
the next visual-plan version removes only that decorative set.

Exterior slots deliberately live in the recipe's `approach` placement region,
outside the canonical location bounds but inside the walkable presentation
ground. They remain `decorativeOnly`, retain stable IDs across patches, and do
not mint trees or rocks into `WorldSnapshot`.

Woodland recipes use the bounded `woodland` placement region. Semantic tags for
pine trees, undergrowth, grass, fungi, deadwood and forest rocks resolve to the
active approved style kit. The renderer never receives model URLs from Part 1.

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

## Generalization proof

The rain-washed courtyard fixture is intentionally unlike the two interior
fixtures. Its snapshot and patch use the frozen interfaces, while its visual
plan selects an open-air shell, smaller wet cobbles, plastered masonry arcades,
ivy, rain, puddles, approved approach vegetation and decorative coaching-yard
clusters. Passage two moves the
chair, lights a surface-mounted lantern, unlocks the gate and adds a map without
rebuilding the environment.

The Mosswood fixture then provides a second open-air proof with no courtyard
architecture: its visual plan selects forest-floor, path and woodland-boundary
modules plus 49 deterministic approved-asset placements. Its factual lantern,
fallen cedar, mushroom ring and waystone retain canonical snapshot identities.

The same mechanism applies to imported story packages. Adding another biome or
architectural family requires registering renderer modules and tags, not adding
story-specific branching to the application shell.
