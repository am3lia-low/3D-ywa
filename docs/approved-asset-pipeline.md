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

## Approval metadata

Every `ApprovedAssetEntry` records:

- accepted semantic kinds, aliases and tags;
- compatible style kits;
- floor, wall or surface placement;
- source, author and license;
- supporting or hero quality level;
- normalized runtime geometry, dimensions and material definition.

Vendored assets should be converted to web-sized glTF/GLB, normalized, visually
reviewed and recorded in `public/models/manifest.json` before an entry is added.

## Expansion strategy

Add complete style kits rather than unrelated individual models. A useful kit
contains modular architecture, common furniture, small props, PBR materials,
lighting/HDRI intent and a designed unknown-object fallback. New novels can reuse
a kit while retaining different entity IDs and layouts.

Generated hero assets must pass isolated and in-world review, then be copied to
durable project storage and promoted into this approved library. Temporary local
TripoSR previews are never normal application assets.

## Generalization fixture

The fixture selector includes two independent stories:

- **The attic study** uses exact canonical asset keys and the grounded storybook
  historical kit.
- **The moonlit conservatory** uses new IDs, semantic-only common-object matches
  and the botanical-gothic glasshouse kit. Its unique celestial orrery remains a
  designed fallback, demonstrating where offline hero-asset generation belongs.

Switching fixtures remounts the spatial runtime at that story's first immutable
snapshot. Patches and renderer acknowledgements cannot leak between stories.
