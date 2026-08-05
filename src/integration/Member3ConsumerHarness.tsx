import { useState } from "react";
import {
  EntityInspector,
  WorldViewer,
  compileSceneRecipe,
  useWorldStream,
  type ScenePatch,
  type VisualScenePlan,
  type WorldSnapshot,
  type WorldViewerRuntimeError,
} from "../index";

/**
 * Compile-checked example of the complete reader-owned integration boundary.
 * It intentionally imports only from src/index.ts, just as Member 3 should.
 */
export function Member3ConsumerHarness({
  initialSnapshot,
  initialVisualPlan,
  onPassageAdvance,
  onLocationRequest,
  onRuntimeError,
}: {
  initialSnapshot: WorldSnapshot;
  initialVisualPlan: VisualScenePlan;
  onPassageAdvance: () => void;
  onLocationRequest: (locationId: string) => void;
  onRuntimeError: (error: WorldViewerRuntimeError) => void;
}) {
  const stream = useWorldStream(initialSnapshot);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [visualPlan] = useState(initialVisualPlan);
  const recipe = compileSceneRecipe(stream.currentSnapshot, visualPlan);

  // A transport adapter calls these two functions; the viewer never fetches.
  const acceptPatch = (patch: ScenePatch) => stream.ingestPatch(patch);
  const acceptSnapshot = (snapshot: WorldSnapshot) => stream.resynchronize(snapshot);
  void acceptPatch;
  void acceptSnapshot;

  return (
    <main>
      <WorldViewer
        snapshot={stream.snapshot}
        patch={stream.patch}
        visualPlan={visualPlan}
        sceneRecipe={recipe}
        assetRegistry={recipe.assetRegistry}
        selectedEntityId={selectedEntityId}
        onEntitySelect={setSelectedEntityId}
        onPatchApplied={stream.onPatchApplied}
        onLocationRequest={onLocationRequest}
        onPassageAdvance={onPassageAdvance}
        passageActionLabel="Continue reading"
        passageActionDisabled={stream.status !== "ready"}
        onRuntimeError={onRuntimeError}
        activeLocationId={stream.currentSnapshot.locations[0]?.id}
        className="reader-world"
      />
      <EntityInspector
        snapshot={stream.currentSnapshot}
        selectedEntityId={selectedEntityId}
        onEntitySelect={setSelectedEntityId}
      />
    </main>
  );
}
