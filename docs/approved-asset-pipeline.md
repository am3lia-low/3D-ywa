# Approved asset pipeline

The runtime builds attractive scenes from a curated library first. Mesh
generation is an asynchronous fallback for unmatched, important story objects;
it is not the normal rendering path.

## Inputs

`WorldSnapshot` supplies canonical identity, entity kind, optional `assetKey`,
location and spatial relations. `VisualScenePlan` supplies story-level art
direction and entity descriptions without changing narrative truth.

## Resolution order

1. Select one `StoryStyleKit` for the entire story segment.
2. Prefer an exact approved `assetKey` match.
3. Otherwise score approved assets using entity kind, name, aliases, materials,
   colours and search tags.
4. Install the winner under the canonical entity ID.
5. Leave unrelated objects unresolved. The viewer renders its designed fallback,
   while supporting or hero objects can enter the offline generation queue.

Exact asset keys make selections stable across passage patches. Semantic
selection uses deterministic scoring and catalog-ID tie-breaking.

## Versioned quality gate

`src/data/asset-kit-catalog.json` is the runtime and semantic resolver's single
source of truth. It records complete style-kit roles, provenance, normalized
runtime dimensions and measurable quality limits. A catalog entry is not
approved merely because a URL loads.

Run the local gate before committing a new asset:

```bash
pnpm assets:report
```

Reviewed Poly Haven source models use an offline, reproducible preparation step:

```bash
pnpm assets:prepare:quality
```

The preparation script accepts only reviewed slugs, verifies every Poly Haven
checksum, caches the immutable 1K source package outside version control and
generates near, medium and far GLB levels with pinned `gltfpack`. The runtime
chooses a level from camera distance before loading it. The source cache means
subsequent runs do not depend on the network; the committed optimization
manifest records source provenance, geometric ratios, output bytes and SHA-256
digests.

The portable Node optimizer preserves the source 1K PBR textures because it has
no native WebP/KTX2 encoder. Geometry is simplified and normalized without
quantization so the existing bounds gate can measure it. A native texture
transcoder can be introduced later without changing the catalog or renderer
contract.

The gate parses local glTF and GLB files, resolves their buffers and images,
checks glTF 2.0 structure, PBR texture assignments, triangle and byte budgets,
source bounds and normalization distortion. It also proves that each style kit
covers all of its declared roles. The deterministic report is written to
`docs/asset-quality-report.json`; `pnpm verify` runs the same checks without
rewriting it.

A known issue can pass only as an explicit warning with a reviewed `waiver` in
the catalog. Missing files, incomplete kits and unwaived budget or material
failures stop verification.

## Approval metadata

Every catalog asset records:

- accepted semantic kinds, aliases and tags;
- compatible style kits;
- floor, wall or surface placement;
- source, author and license;
- supporting or hero quality level;
- normalized runtime geometry, dimensions and material definition.

Vendored assets should be converted to web-sized glTF/GLB, normalized, visually
reviewed and recorded with its source URL and license before an entry is added.

## Expansion strategy

Add complete style kits rather than unrelated individual models. A useful kit
contains modular architecture, common furniture, small props, PBR materials,
lighting/HDRI intent and a designed unknown-object fallback. New novels can reuse
a kit while retaining different entity IDs and layouts.

Generated hero assets must pass isolated and in-world review, then be copied to
durable project storage and promoted into this approved library. Temporary local
TripoSR previews are never normal application assets.

## Generalization fixture

The fixture selector includes four independent stories:

- **The attic study** uses exact canonical asset keys and the grounded storybook
  historical kit.
- **The moonlit conservatory** uses new IDs, semantic-only common-object matches
  and the botanical-gothic glasshouse kit. Its unique celestial orrery remains a
  designed fallback, demonstrating where offline hero-asset generation belongs.
- **The rain-washed courtyard** exercises the same recipe outside: open-air
  masonry, wet cobbles, rain and decorative-only coaching-yard clusters surround
  a fully approved canonical prop set.
- **The misted Mosswood path** selects the woodland-storybook kit, procedural
  forest floor and trail modules, two pine silhouettes and approved groundcover,
  fungi, deadwood and rock assets from semantic visual-plan tags.

Switching fixtures remounts the spatial runtime at that story's first immutable
snapshot. Patches and renderer acknowledgements cannot leak between stories.

The universal-family stress fixture additionally routes natural-language
alpine, desert, coastal, meadow, market and industrial descriptions through the
same compiler. Its woodland groundcover, weathered rock formations, ornate
market lamps and industrial pipe banks use optimized CC0 LOD assets instead of
unbounded live generation.

## Scene recipe compilation

`compileSceneRecipe(snapshot, visualPlan)` combines style selection, modular
environment selection, approved-asset resolution and missing-asset routing into
one deterministic artifact. Architecture and dressing tags are matched against
a closed renderer module registry; unknown tags cannot execute arbitrary code or
silently create narrative facts.

For outdoor scenery, Part 1 may emit the generic `dressingTags`
`broadleaf-trees`, `hedges` and `verge-rocks` (the aliases `trees`, `oak-trees`,
`shrubs`, `bushes`, `rocks` and `boulders` are also accepted). The recipe then
selects compatible assets from the active approved style kit and emits stable,
presentation-only placements. Part 1 does not need to know model URLs or asset
catalog IDs.

Woodland plans can likewise request `pine-trees`, `forest-undergrowth`,
`grass-tufts`, `wild-mushrooms`, `fallen-logs` and `forest-rocks`. These tags
select the closed woodland kit and its bounded deterministic placement recipes;
they never add factual trees or fungi to the snapshot.

Spatial relations remain factual inputs. The recipe makes their runtime effect
inspectable as constraints such as `anchor_to_surface`, `face_target`,
`reserve_access_zone` and `center_in_room`. Unsupported important entities are
listed both as designed fallbacks and generation jobs, so the scene stays usable
while offline asset work continues.
