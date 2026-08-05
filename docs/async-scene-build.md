# Asynchronous scene-build orchestration

This Part 2 service boundary prepares a renderable world while the reader can
continue elsewhere in the product. It does not own reader notifications or the
final loading experience.

## Lifecycle

```text
queued -> resolving -> generating -> reviewing -> ready
                                   \-> partial / failed
```

1. `queue(snapshot, visualPlan, providerId)` creates or loads a content-addressed
   build record.
2. Approved-library assets resolve first under canonical entity IDs.
3. Only remaining supporting or hero jobs reach the configured final-asset
   provider.
4. Generated candidates remain outside the manifest while awaiting review.
5. `preview` creates a temporary registry without promoting the candidate.
6. `review(..., "approved")` is locked until that exact candidate was previewed.
7. Approval installs the asset under the existing entity ID and caches the ready
   manifest. Rejection or provider failure keeps the fallback world usable.

The cache key includes the factual snapshot, visual plan and provider ID—not
only version numbers—so altered content cannot reuse a stale build accidentally.

## Storage and providers

`AsyncSceneBuildStore` is the persistence boundary. The diagnostic panel uses a
browser-storage implementation for the MVP. Production should store records and
artifacts in backend database/object storage while preserving this interface.

`SceneAssetProvider` is provider-neutral. ComfyUI/TripoSR, a curated asset search
service, or another offline generator can satisfy it after producing a final
normalized runtime asset. The deterministic mock provider is deliberately a
diagnostic substitute and must not be presented as production art.

## Ownership

Part 2 owns build state, cache identity, manifest readiness, asset resolution and
safe promotion. Member 3 consumes status such as `reviewing`, `ready` or
`partial` to implement reader-facing progress and the “Explore this scene” flow.
