import { lazy, Suspense, useMemo, useState } from "react";
import snapshotFixture from "../fixtures/snapshot_1.json";
import patch2Fixture from "../fixtures/patch_2.json";
import patch3Fixture from "../fixtures/patch_3.json";
import visualPlan1Fixture from "../fixtures/visual_scene_plan_1.json";
import visualPlan3Fixture from "../fixtures/visual_scene_plan_3.json";
import { AssetReviewPanel } from "./components/AssetReviewPanel";
import { EntityInspector } from "./components/EntityInspector";
import type { VisualScenePlan } from "./contracts/visualScenePlan";
import type { ScenePatch, WorldSnapshot } from "./contracts/world";
import { applyScenePatch } from "./runtime/applyScenePatch";
import type { AssetRegistry } from "./runtime/assetRegistry";
import { buildSceneManifest } from "./runtime/sceneBuildPipeline";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const patch2 = patch2Fixture as unknown as ScenePatch;
const patch3 = patch3Fixture as unknown as ScenePatch;
const visualPlan1 = visualPlan1Fixture as unknown as VisualScenePlan;
const visualPlan3 = visualPlan3Fixture as unknown as VisualScenePlan;
const WorldViewer = lazy(() =>
  import("./components/WorldViewer").then((module) => ({ default: module.WorldViewer })),
);
const invalidPatch: ScenePatch = {
  fromVersion: 99,
  toVersion: 100,
  operations: [],
};

export default function App() {
  const [step, setStep] = useState(0);
  const [session, setSession] = useState(0);
  const [invalidPatchMode, setInvalidPatchMode] = useState(false);
  const [acknowledgedVersion, setAcknowledgedVersion] = useState(snapshot.version);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState(snapshot.locations[0]?.id ?? "");
  const [reviewRegistry, setReviewRegistry] = useState<AssetRegistry | null>(null);
  const patch = invalidPatchMode ? invalidPatch : step === 1 ? patch2 : step === 2 ? patch3 : null;
  const visualPlan = acknowledgedVersion >= 3 ? visualPlan3 : visualPlan1;
  const derivedSnapshot = useMemo(() => {
    if (step === 0) return snapshot;
    const version2 = applyScenePatch(snapshot, patch2);
    return step === 1 ? version2 : applyScenePatch(version2, patch3);
  }, [step]);
  const sceneBuild = useMemo(
    () => buildSceneManifest(derivedSnapshot, visualPlan),
    [derivedSnapshot, visualPlan],
  );
  const reset = () => {
    setStep(0);
    setInvalidPatchMode(false);
    setSession((current) => current + 1);
    setSelectedEntityId(null);
    setReviewRegistry(null);
    setActiveLocationId(snapshot.locations[0]?.id ?? "");
    setAcknowledgedVersion(snapshot.version);
  };

  return (
    <main className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Persistent StoryWorld 3D · Spatial Runtime</p>
          <h1>The same room, changed by the story.</h1>
          <p className="lede">
            A deterministic world layout driven by one snapshot and semantic patches—not a
            regenerated scene.
          </p>
        </div>
        <div className="version-chip" aria-live="polite">
          <span>World state</span>
          <strong>v{step + 1}</strong>
          <small>renderer ack v{acknowledgedVersion}</small>
          <small>visual plan v{visualPlan.planVersion}</small>
          <small>scene build {sceneBuild.status}</small>
        </div>
      </header>

      <section className="viewer-frame" aria-label="Interactive 3D story world">
        <Suspense
          fallback={
            <div className="viewer-loading" role="status">
              Loading spatial runtime…
            </div>
          }
        >
          <WorldViewer
            key={session}
            snapshot={snapshot}
            patch={patch}
            visualPlan={visualPlan}
            assetRegistry={reviewRegistry ?? sceneBuild.assetRegistry}
            activeLocationId={activeLocationId}
            selectedEntityId={selectedEntityId}
            onEntitySelect={setSelectedEntityId}
            onLocationRequest={(locationId) => {
              setActiveLocationId(locationId);
              setSelectedEntityId(null);
            }}
            onPatchApplied={(currentSnapshot) =>
              setAcknowledgedVersion(currentSnapshot.version)
            }
          />
        </Suspense>
        <div className="viewer-hint">
          Left-drag to pan · Right-drag to rotate · Scroll to zoom · Double-click floor to move
        </div>
      </section>

      <section className="control-deck">
        <div className="passage-card">
          <span>Passage {step + 1}</span>
          <label className="location-picker">
            <span>Active location</span>
            <select
              value={activeLocationId}
              onChange={(event) => {
                setActiveLocationId(event.target.value);
                setSelectedEntityId(null);
              }}
            >
              {derivedSnapshot.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            {step === 0 &&
              "Elian enters the old attic study. A faded rug faces the writing desk, while a folded map rests beside the cold north-wall hearth."}
            {step === 1 &&
              "He drags the chair away and finds fresh scratches in the wood. An unlit brass lantern waits beside the desk."}
            {step === 2 &&
              "Elian lights the hearth and carries the lantern north. In the warm flicker, the outline of a hidden door appears."}
          </p>
        </div>

        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={reset}
            disabled={step === 0 && !invalidPatchMode}
          >
            Reset world
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setInvalidPatchMode(true)}
            disabled={invalidPatchMode}
          >
            Test invalid patch
          </button>
          <button
            type="button"
            onClick={() => {
              setInvalidPatchMode(false);
              setReviewRegistry(null);
              setStep((current) => Math.min(2, current + 1));
            }}
            disabled={step === 2}
          >
            {step === 0 ? "Apply passage 2" : "Reveal passage 3"}
          </button>
        </div>

        <EntityInspector
          snapshot={derivedSnapshot}
          selectedEntityId={selectedEntityId}
          onEntitySelect={setSelectedEntityId}
        />
      </section>

      <AssetReviewPanel
        snapshot={derivedSnapshot}
        visualPlan={visualPlan}
        baseRegistry={sceneBuild.assetRegistry}
        onRegistryPreview={setReviewRegistry}
      />
    </main>
  );
}
