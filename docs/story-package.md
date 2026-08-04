# Story package integration contract

`StoryPackage` is the portable handoff from narrative processing to the spatial
runtime. Importing one JSON file adds a story without changing React code.

```ts
interface StoryPackage {
  schemaVersion: "1.0";
  packageId: string;
  label: string;
  initialSnapshot: WorldSnapshot;
  moments: Array<{
    passageId: string;
    text: string;
    patchFromPrevious?: ScenePatch;
    visualPlan?: VisualScenePlan;
    actionLabel?: string;
  }>;
}
```

## Ordering rules

- The opening moment has no patch and must include a visual plan.
- Every later moment has exactly one forward patch from the preceding world
  version.
- A later moment may omit `visualPlan`; the most recent validated plan carries
  forward until visual context changes.
- New visual plan versions increase monotonically and preserve
  `previousPlanVersion`.
- Snapshot, patch and visual-plan story/location/entity IDs must join exactly.
- Every intermediate snapshot must remain valid after its patch is applied.
- Every compiled moment must pass the spatial composition preflight. Blocking
  overlap, scale, access, facing-support or surface-support errors reject the
  package before it mounts in `WorldViewer`.

The loader rejects the entire package before it changes the mounted story. It
reports structural paths, broken version links and non-canonical visual IDs.
Imports are session-only and limited to 2 MB in the browser MVP.

Use `fixtures/story_package_import_demo.json` as the working example. Member 1
can target `src/integration/storyPackage.ts` for the TypeScript surface and this
fixture for serialized output.
