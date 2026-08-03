# Live Part 1 adapter

The live adapter consumes the frozen passage endpoint:

```http
POST /api/stories/{story_id}/passages
Content-Type: application/json

{
  "passage_id": "P2",
  "text": "The current story passage..."
}
```

The standard response fields remain `snapshot`, `patch`, `conflicts` and
`processing_summary`. The spatial runtime additionally accepts a companion
visual plan under `visual_plan`, `visual_scene_plan` or `visualPlan`.

The opening response must include a visual plan. Later responses may omit it;
the last validated plan carries forward until Part 1 emits a newer version.

## Continuity checks

`LivePart1StorySession` rejects a response before it changes the mounted world
when:

- story or passage IDs differ from the request;
- the opening visual plan is missing;
- a later response has no forward patch;
- the patch version does not continue the current session; or
- applying the patch does not reproduce the locations, entities and relations
  in the supplied authoritative snapshot.

The last case requests resynchronization instead of combining contradictory
state. Conflict arrays remain a parallel product concern because the frozen
`ScenePatch` operations do not mutate conflicts.

## Local integration proof

Run these in separate terminals:

```bash
pnpm part1:mock
pnpm dev
```

Open **Live Part 1 connection** in the app. The defaults target
`http://127.0.0.1:8787`. Submit P1, then P2, then P3. The mock returns the same
contract shapes as the teammate service, deliberately reuses visual plan v1 for
P2, and supplies visual plan v2 for P3.

For the real backend, replace only the API base URL. It must allow the deployed
frontend origin through CORS or be exposed through the product backend proxy.
