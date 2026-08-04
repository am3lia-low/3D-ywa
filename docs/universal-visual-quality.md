# Universal visual-quality strategy

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
This makes approved meshes and designed fallbacks respond to one art-directed
lighting rig instead of looking pasted together.

## Generalization safeguards

- Semantic inference changes presentation only. It never creates a canonical
  narrative entity or relation.
- Explicit indoor terms override incidental outdoor words so a laboratory or
  chamber stays enclosed.
- Natural-language terms such as `conifer`, `spruce`, `mist`, `trail`,
  `deadwood`, `fungi` and `boulders` resolve to canonical renderer modules.
- If no style vocabulary matches, the `generic-grounded` kit wins instead of an
  arbitrary alphabetical kit.
- If Part 1 omits the visual plan entirely, the renderer provides a labeled
  polished storybook fallback and infers only broad indoor/outdoor presentation.
- All decisions are deterministic for the same input package.

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
