# Multi-location rooms and door traversal

This is the cross-team recipe for passages that expose a second room, building,
courtyard, path segment, or other traversable location. Ashwood Chapter 3's
hall-to-schoolroom interaction is the reference implementation.

## Ownership

| Concern | Owner | Required result |
| --- | --- | --- |
| Decide from the novel that two places canonically exist | Member 1 | Two stable `WorldSnapshot.locations[]` IDs |
| Decide that a named door connects those places | Member 1 | One canonical door entity plus an evidenced `presentationConnection` |
| Assign story objects to the correct room | Member 1 | Every entity has the correct canonical `locationId` |
| Build a deterministic room for each location | Member 2 | One compiled layout and presentation per location |
| Place and make the door clickable | Member 2 | Portal interaction calls `onLocationRequest(targetLocationId)` |
| Store the requested destination | Member 3 integration adapter | Feed the requested canonical ID back through `activeLocationId` |
| Render the destination without rebuilding the story | Member 2 | Switch to the already compiled location recipe |
| Show preparation, retry, reader navigation, and errors | Member 3 | Product UI around the mounted viewer |
| Preload connected rooms before Explore is enabled | Members 2 and 3 integration | Member 2 reports real readiness; Member 3 keeps that warmed canvas mounted |

Member 3 must not infer a second room from prose or build a duplicate navigation
system. Member 2 must not invent a canonical room or door that Member 1 did not
emit. A purely presentational shortcut is permitted only with
`presentationOnly: true` and must never become narrative state.

## Minimum input

Member 1 must preserve the same IDs in the factual snapshot and visual plan.
Coordinates are optional; Member 2 generates deterministic defaults.

```json
{
  "snapshot": {
    "storyId": "ashwood",
    "version": 3,
    "passageId": "ashwood-ch3",
    "locations": [
      { "id": "ashwood-ch3:scene", "name": "Front Hall" },
      { "id": "ashwood-ch3:schoolroom", "name": "The Former Schoolroom" }
    ],
    "entities": [
      {
        "id": "east-hall-door",
        "name": "East Hall Door",
        "kind": "architecture",
        "locationId": "ashwood-ch3:scene"
      },
      {
        "id": "schoolroom-ledger",
        "name": "Open Schoolroom Ledger",
        "kind": "decor",
        "locationId": "ashwood-ch3:schoolroom"
      }
    ],
    "relations": [],
    "conflicts": []
  },
  "visualPlan": {
    "locations": [
      { "locationId": "ashwood-ch3:scene", "archetype": "country-estate hall" },
      { "locationId": "ashwood-ch3:schoolroom", "archetype": "forgotten schoolroom" }
    ],
    "presentationConnections": [
      {
        "entityId": "east-hall-door",
        "fromLocationId": "ashwood-ch3:scene",
        "targetLocationId": "ashwood-ch3:schoolroom",
        "presentationOnly": false,
        "evidence": {
          "passageIds": ["ashwood-ch3"],
          "confidence": 0.97,
          "basis": "explicit_text"
        }
      }
    ]
  }
}
```

The abbreviated location plans above show the important joins. Real input must
still include every field required by `VisualScenePlanSchema`.

## Runtime flow

1. Member 3 receives the snapshot and visual plan from Member 1.
2. `compileSceneRecipe(snapshot, visualPlan)` validates every canonical join and
   compiles one location recipe per `snapshot.locations[]` entry.
3. Before Explore is enabled, the integration mounts `WorldViewer` off-screen and
   visits each compiled location until `onSceneReady` reports its loader queue
   settled.
4. Member 3 changes only the surface visibility when the reader clicks Explore.
   The already-warmed WebGL canvas stays mounted.
5. Member 2 finds the connection whose `fromLocationId` matches the active room
   and attaches the destination to the canonical door entity.
6. Clicking the door calls `onLocationRequest(targetLocationId)`.
7. The Member 3 adapter updates `activeLocationId`; Member 2 displays the already
   compiled destination without reprocessing the passage.
8. For `presentationOnly: false`, Member 2 renders the reverse face of that same
   canonical door in the destination and labels it **Return to ...**. No second
   narrative door ID is created. Presentation-only portals remain one-way unless
   Member 1 explicitly supplies another evidenced connection.

The combined application implements steps 3, 4, and 7 in
`Create UI Prototype for Hackathon/src/App.tsx` and
`Create UI Prototype for Hackathon/src/components/WorldViewer.tsx`.

## Validation rules

- `storyId` and `snapshotVersion` must match the active world.
- Both connection location IDs must exist in `WorldSnapshot.locations`.
- `entityId` must identify a canonical door, gate, hatch, or portal entity.
- The entrance entity belongs to `fromLocationId`; destination props belong to
  `targetLocationId`.
- Every location needs a matching `VisualScenePlan.locations[]` entry.
- Canonical IDs remain unchanged across later snapshots and patches.
- `presentationOnly: false` requires factual passage evidence.
- Factual physical connections receive a return route using the same canonical
  entrance identity.
- A missing or broken join fails scene compilation instead of silently spawning
  a freestanding door.

## Integration example

Member 2's public component remains controlled and reusable:

```tsx
const [activeLocationId, setActiveLocationId] = useState(snapshot.locations[0].id)

<WorldViewer
  snapshot={snapshot}
  visualPlan={visualPlan}
  sceneRecipe={compileSceneRecipe(snapshot, visualPlan)}
  activeLocationId={activeLocationId}
  onLocationRequest={setActiveLocationId}
  onSceneReady={markActiveLocationReady}
/>
```

The combined Member 3 adapter already contains this behavior. Consumers using
that adapter do not need another location state machine.

## Test the reference implementation

1. Run `pnpm dev:integrated` and open `http://127.0.0.1:8443/`.
2. Read Ashwood through Chapter 3 and wait for **Scene ready**.
3. Select **Explore the Scene**. It should reveal the warmed world immediately.
4. In the hall, use **Overview** if necessary and select
   **Enter The Former Schoolroom** above the east-hall door.
5. Confirm that the schoolroom contains its own table, chairs, ledger, horse
   figurine, photograph, and shelving, rather than those objects appearing in
   the hall.
6. Select **Return to Front Hall** and confirm that the same connection returns
   to the original room without rebuilding the scene.

Run `pnpm test` and `pnpm check:integrated` before handoff.
