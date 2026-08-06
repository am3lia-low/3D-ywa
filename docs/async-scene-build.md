# Reviewed asset-build and promotion pipeline

This is the canonical Member 2 missing-asset path. It prepares optional visual
upgrades while the reader continues to use a complete world. It does not own
reader notifications, passage controls or the final loading experience.

The shareable overview is [`member-2-asset-generation-flow.png`](member-2-asset-generation-flow.png),
with an editable source in
[`member-2-asset-generation-flow.svg`](member-2-asset-generation-flow.svg).

## Reader-safe resolution outcomes

Every canonical entity receives exactly one inspectable outcome in
`CompiledSceneRecipe.assetOutcomes`:

| Outcome | Reader sees | Internal next action |
| --- | --- | --- |
| `approved_asset` | approved catalog model | none |
| `promoted_generated_asset` | durable reviewed story asset | none |
| `designed_fallback_background` | lightweight semantic fallback | none |
| `needs_visual_plan` | fallback | Part 1 supplies the missing visual description |
| `generation_queued` | fallback | run the configured internal provider |
| `generating_reference` | fallback | wait |
| `needs_reference_review` | fallback | internal reference review |
| `reference_approved` | fallback | build the runtime asset |
| `reconstructing` / `optimizing` | fallback | wait |
| `needs_asset_review` | fallback outside preview | preview and review in world |
| `ready_to_promote` | fallback or explicit session preview | export durable promotion |
| `generation_rejected` / `generation_failed` | fallback | retry, choose another provider, or retain fallback |

`readerCanExplore` remains true for every asset outcome. Scene composition can
still reject a world for a genuinely blocking spatial error, but a missing or
failed asset alone never blocks exploration.

## Canonical queue lifecycle

`SceneAssetQueue` is the canonical reviewed path:

```text
queued
  -> generating_reference
  -> needs_review
  -> approved
  -> reconstructing
  -> optimizing (optional)
  -> needs_asset_review
  -> ready
```

At either review boundary, rejection moves the item to `rejected`. Provider or
optimizer errors move it to `failed`. Both states are retryable while the
designed fallback stays active. A failed reconstruction reuses the already
approved reference; it does not spend another generation attempt unnecessarily.

The older `AsyncSceneBuildOrchestrator` and deterministic mock provider remain
diagnostic compatibility tools. They are not the production-quality path and
must not be used to claim that an unreviewed asset is ready.

## Which items enter the queue

Approved-library assets resolve first. An unmatched entity behaves as follows:

- `background`: render the designed fallback and do not generate by default;
- `supporting` or `hero`: render the fallback and create a generation job;
- no matching visual-plan entity: render the fallback and report
  `needs_visual_plan`; generation cannot create a grounded prompt yet.

Planar items such as documents, maps, paintings, rugs and tapestries use
`surface_template`. Volumetric items use `image_to_mesh`. This avoids turning a
flat illustration into an arbitrary reconstructed blob.

## Two approvals are mandatory

The reference image and the final runtime asset are different review subjects.
A candidate cannot become durable unless:

1. a human approved the generated reference;
2. reconstruction or templating completed successfully;
3. the exact runtime artifact was previewed in the world;
4. a human approved that in-world artifact.

`createReviewedAssetPromotionBundle` enforces both approvals and records the
reference provider, reconstruction provider, prompts, versioned canonical IDs,
validation evidence and artifact metadata.

## Live-session preview versus durable promotion

**Use in this session** overlays a reviewed candidate in the current browser.
It is intentionally temporary and disappears when that session or registry is
reset.

**Export durable promotion** downloads the twice-reviewed promotion bundle. A
developer then runs:

```bash
pnpm assets:promote path/to/story-entity-promotion.json
pnpm verify
```

The materializer accepts controlled surface bytes, a self-contained GLB already
under `public/`, a base64 GLB, or a reviewed GLB served by localhost. It writes
the durable artifact beneath `public/generated/promoted/` and records it in
`src/data/promoted-story-assets.json`.

At the next build, `resolvePromotedStoryAssets` selects the newest promotion at
or before the active snapshot version. It joins by exact `storyId` and canonical
`entityId`, so a story-specific generated object cannot leak into another novel.
Later passage patches automatically reuse it under the same identity.

Promotions remain story-specific. A developer may separately curate a broadly
reusable result into `asset-kit-catalog.json`, but that is a stronger global
approval decision and is never automatic.

## Providers and deployment

The queue is provider-neutral. The current local reference and reconstruction
adapters are ComfyUI and TripoSR, plus a controlled surface-template provider.
They are optional developer tools, not teammate or reader requirements.

Production can replace them with a curated asset-search backend or another
generation service while retaining the same queue, review and promotion
contracts. Only artifacts committed beneath `public/generated/`, `public/models/`
and `public/textures/` ship to Member 3's deployed application.

Member 3 consumes recipe readiness and asset outcome counts to show reader-safe
states such as “Preparing optional scene details” or “Ready to explore.” It must
not expose provider endpoints, candidate approval or durable promotion controls
to readers.
