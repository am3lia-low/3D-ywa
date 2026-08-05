# Editing the Part 1 story-package template

The complete Member 1 -> Member 2 -> Member 3 contract is documented in
`docs/team-integration-contract.md`. This file is the shorter editing checklist
for the canonical example.

Start with `fixtures/part1_story_package_template.json`. The file is a complete,
valid one-passage Part 1 output, so it can be imported before or after editing.

## The three kinds of information

1. `initialSnapshot` is narrative truth: canonical locations, objects and
   factual spatial relations found in the novel.
2. `moments[0].text` is the selected passage.
3. `moments[0].visualPlan` is art direction inferred from the novel. It can
   enrich presentation, but it does not create factual objects.

## Minimum edit

- Change `packageId`, `label` and both occurrences of `storyId`.
- Change `passageId`, the passage `text`, location name and location prose.
- Replace the sample entities. Every `entityId` in `visualPlan.entities` must
  exactly match an entity `id` in `initialSnapshot.entities`.
- Update or remove relations whose entity IDs no longer exist.
- Describe the environment concretely in `archetype`, `visualDescription`,
  `architectureTags`, `dressingTags`, `mood` and `timeOfDay`.

## Fields with the largest visual effect

- `locations[].bounds`: use roughly `[28, 8, 36]` for explorable outdoor areas
  and `[14, 5, 18]` for rooms.
- `archetype` and `visualDescription`: name the environment family and its
  defining shapes, such as woodland, glasshouse, market, coast or alpine pass.
- `architectureTags`: reliable outdoor tags include `open-air`, `forest-floor`,
  `winding-path` and `woodland-edge`.
- `dressingTags`: woodland options include `broadleaf-trees`, `pine-trees`,
  `forest-undergrowth`, `grass-tufts`, `wild-mushrooms`, `fallen-logs` and
  `forest-rocks`.
- `palette` and `lighting`: control the overall color story, time and mood.
- `assetKey`: optional exact approved assets include `desk`, `chair`,
  `wooden-bench`, `wooden-crate`, `lantern`, `map`, `rug`, `hidden-door`,
  `carriage-gate`, `wine-barrel` and `fireplace`. Omit it for an unfamiliar
  object; the runtime will show a designed fallback and flag an offline asset job.

## Spatial relations

Use `on` for an object supported by a table or container, `inside` for contents,
`near`, `left_of`, `right_of`, `in_front_of` or `behind` for relative placement,
`centered` for a single centered object, and `against_wall` with a north, south,
east or west `metadata.wall` for doors and wall objects.

Import the edited JSON using **Import story package** above the viewer. Imports
are session-only, so re-import the file after a page refresh.
