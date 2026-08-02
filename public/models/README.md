# StoryWorld low-poly models

The root GLB files are original project assets generated from geometric primitives by
`scripts/generate-models.mjs`. The `polyhaven/` directory contains separately
documented CC0 glTF assets used for the visual-quality path.

Regenerate them with:

```bash
pnpm models:generate
```

Generated models are normalized at export time. Vendored models are normalized by
the runtime from their source bounds. In both cases the renderer then applies
semantic dimensions from the asset registry.
