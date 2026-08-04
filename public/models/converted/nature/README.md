# Converted nature assets

These runtime-safe meshes are derived from Kenney's [Nature Kit](https://kenney.nl/assets/nature-kit), version 1.0. The source pack is released under CC0 1.0.

The original source files are not served directly. The approved set currently
contains oak, bush, rock, two pine silhouettes, fallen log, grass tuft and red
mushroom group variants. They are processed by
`scripts/convert-external-glb.mjs`, which:

- bakes transforms and grounds the pivot;
- removes textures, morph targets, tangents, and unsupported material extensions;
- converts surfaces to opaque, rough `MeshStandardMaterial` definitions;
- applies the muted `storybook-outdoor` or `storybook-woodland` palette;
- rejects non-finite geometry and assets over the triangle or byte budget; and
- emits a normalized `.mesh.json` package used by the runtime.

The adjacent report files record source and output SHA-256 hashes, dimensions, triangle counts, policy, and palette. The GLB is retained as an auditable converted artifact; the viewer uses the bundled safe-mesh package because it has proved more stable across WebGL implementations.

These assets are presentation-only scenery. They do not create narrative entities or alter canonical world state.
