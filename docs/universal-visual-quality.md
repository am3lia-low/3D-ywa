# Universal visual-quality strategy

## Browser-quality source assets

The web runtime is the delivery target, not the source-asset ceiling. Reviewed
high-quality models are prepared offline into distance-selected levels of
detail. The quality packs add photoreal fern clusters, weathered rock formations,
ornate street lamps and modular industrial pipes while preserving deterministic
semantic recipes and canonical story identities. Period interiors now use
browser-optimized CC0 PBR Gothic cabinets, worn bookshelves, a Victorian console,
an upholstered armchair and an antique lantern chandelier for hero furniture;
the lightweight Kenney Furniture Kit remains the fast fallback layer for distant
or unexpected dressing. Woodland scenes now use a
cohesive CC0 Quaternius Stylized Nature MegaKit subset: six tree variants, a hero
tree, shrubs, ferns, flowers, grass, mushrooms and rocks with shared 512px
textures. This replaces the former procedural-conifer backdrop.

Raw scan assets are not rejected for being photorealistic; they are rejected
only when no reviewed browser-ready derivative exists. Multi-million-triangle
trees remain outside the approved registry until a decimation and foliage-
impostor pass can meet the same measurable visual, triangle and byte gates.

The spatial runtime does not promise that arbitrary prose instantly produces a
bespoke studio-quality model for every object. It guarantees a layered quality
path in which unfamiliar stories remain coherent and explorable while important
objects can improve asynchronously.

## Runtime quality ladder

1. Part 1 supplies factual `WorldSnapshot` data and a descriptive
   `VisualScenePlan`.
2. The semantic compiler maps both known tags and unfamiliar natural-language
   descriptions onto finite, tested environment and dressing modules.
3. The art-direction resolver chooses a coherent style kit using the full
   location description, mood, time, architecture, dressing and atmosphere—not
   a story ID.
4. Approved CC0/project assets are preferred whenever they semantically match.
5. Unsupported entities receive category-specific designed fallbacks with useful
   proportions: people, seats, tables, containers, portals, lights, documents,
   plants, vessels or artifacts.
6. Supporting and hero entities without a good approved match remain explicit
   offline asset jobs. A generated model cannot replace its fallback until it is
   previewed and approved.

The environment uses deterministic image-based lighting, ACES tone mapping,
bounded cinematic lights, fog, local contact grounding and textured surfaces.
Alpha-heavy woodland foliage uses the lighter native renderer path instead of
the full screen-space post stack, preserving browser stability and visual density.
This makes approved meshes and designed fallbacks respond to one art-directed
lighting rig instead of looking pasted together.

## Universal environment families

The semantic router currently supports ten broad presentation families:

- historical or generic interiors;
- industrial and science-fiction interiors;
- glasshouses;
- courtyards;
- urban streets and markets;
- woodlands;
- snowy alpine terrain;
- arid deserts and badlands;
- coasts and shorelines; and
- grassland and open countryside.

The additional outdoor families provide distinct terrain palettes, traversable
routes, horizon geometry and deterministic edge dressing. Alpine worlds receive
snow, peaks and snow-laden conifers; deserts receive dunes and eroded rock
spires; coasts receive water, shoreline rocks and beach grass; meadows receive
rolling hills, wild grass, flowers and fencing. Urban worlds supply textured
roads and sidewalks, facade depth, pitched roofs, shop awnings, street lighting,
market stalls and hanging lantern strings. Industrial
interiors supply panelled floors, pipes, work lights, consoles and machinery.

`fixtures/story_package_world_families_demo.json` contains all six newer
families as locations in one data-only package. It is available in the renderer
as **Universal world families** and is preflighted with every build.

## Generalization safeguards

- Semantic inference changes presentation only. It never creates a canonical
  narrative entity or relation.
- Explicit indoor terms override incidental outdoor words so a laboratory or
  chamber stays enclosed.
- Natural-language terms such as `conifer`, `spruce`, `mist`, `trail`,
  `deadwood`, `fungi` and `boulders` resolve to canonical renderer modules.
- Terms such as `glacier`, `dunes`, `shoreline`, `meadow`, `marketplace`,
  `engine room` and `space station` route into distinct world families.
- If no style vocabulary matches, the `generic-grounded` kit wins instead of an
  arbitrary alphabetical kit.
- If Part 1 omits the visual plan entirely, the renderer provides a labeled
  polished storybook fallback and infers only broad indoor/outdoor presentation.
- All decisions are deterministic for the same input package.
- Prepared-scene regression checks reject severe non-uniform asset scaling,
  out-of-bounds canonical placement, unresolved hero assets and below-floor
  dressing before Member 3 integration can ship.

## Stress-test fixture

`fixtures/story_package_unfamiliar_demo.json` intentionally avoids the existing
fixture tags and canonical assets. It describes a rainy highland crossing using
unfamiliar prose and includes a character, container, document, light, portal,
plant and unknown relic.

The public handoff test verifies that it:

- selects the woodland style kit;
- compiles an open forest floor and earth trail;
- resolves more than twelve decorative instances;
- keeps unresolved objects as designed fallbacks and asset jobs; and
- passes composition preflight without blocking geometry faults.

The fixture is also available in the demo selector as **Unfamiliar story stress
test** for manual visual regression.

## Where handcrafted quality still matters

The universal runtime supplies composition, mood, movement, grounding and a
coherent fallback. Distinctive characters, monsters, vehicles, landmark
architecture and plot-critical artifacts still benefit from reviewed external or
generated assets. The asynchronous pipeline exists for this reason; pretending a
generic mesh is a finished hero asset would lower quality and reliability.
