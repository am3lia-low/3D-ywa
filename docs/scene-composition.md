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
- open-air masonry courtyards with cobbles and arcades.

Dressing modules are presentation-only. Books, storage clusters, planters,
ivy, puddles, leaf litter and courtyard clutter improve composition but never
become persistent narrative facts or canonical entity IDs.

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
ivy, rain, puddles and decorative coaching-yard clusters. Passage two moves the
chair, lights a surface-mounted lantern, unlocks the gate and adds a map without
rebuilding the environment.

The same mechanism applies to imported story packages. Adding another biome or
architectural family requires registering renderer modules and tags, not adding
story-specific branching to the application shell.
