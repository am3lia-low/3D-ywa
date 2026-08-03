import { lazy, Suspense, useMemo, useState } from "react";
import snapshotFixture from "../fixtures/snapshot_1.json";
import patch2Fixture from "../fixtures/patch_2.json";
import patch3Fixture from "../fixtures/patch_3.json";
import visualPlan1Fixture from "../fixtures/visual_scene_plan_1.json";
import visualPlan3Fixture from "../fixtures/visual_scene_plan_3.json";
import conservatorySnapshotFixture from "../fixtures/snapshot_conservatory_1.json";
import conservatoryPatch2Fixture from "../fixtures/patch_conservatory_2.json";
import conservatoryPlan1Fixture from "../fixtures/visual_scene_plan_conservatory_1.json";
import conservatoryPlan2Fixture from "../fixtures/visual_scene_plan_conservatory_2.json";
import { EntityInspector } from "./components/EntityInspector";
import type { VisualScenePlan } from "./contracts/visualScenePlan";
import type { ScenePatch, WorldSnapshot } from "./contracts/world";
import { applyScenePatch } from "./runtime/applyScenePatch";
import type { AssetRegistry } from "./runtime/assetRegistry";
import { compileSceneRecipe } from "./runtime/sceneRecipeCompiler";

interface DemoStory {
  id: string;
  label: string;
  snapshot: WorldSnapshot;
  patches: ScenePatch[];
  visualPlans: VisualScenePlan[];
  passages: string[];
  nextLabels: string[];
}

const atticStory: DemoStory = {
  id: "attic-study",
  label: "The attic study",
  snapshot: snapshotFixture as unknown as WorldSnapshot,
  patches: [patch2Fixture, patch3Fixture] as unknown as ScenePatch[],
  visualPlans: [visualPlan1Fixture, visualPlan3Fixture] as unknown as VisualScenePlan[],
  passages: [
    "Elian enters the old attic study. A faded rug faces the writing desk, while a folded map rests beside the cold north-wall hearth.",
    "He drags the chair away and finds fresh scratches in the wood. An unlit brass lantern waits beside the desk.",
    "Elian lights the hearth and carries the lantern north. In the warm flicker, the outline of a hidden door appears.",
  ],
  nextLabels: ["Apply passage 2", "Reveal passage 3"],
};

const conservatoryStory: DemoStory = {
  id: "moonlit-conservatory",
  label: "The moonlit conservatory",
  snapshot: conservatorySnapshotFixture as unknown as WorldSnapshot,
  patches: [conservatoryPatch2Fixture] as unknown as ScenePatch[],
  visualPlans: [
    conservatoryPlan1Fixture,
    conservatoryPlan2Fixture,
  ] as unknown as VisualScenePlan[],
  passages: [
    "Mara enters the moonlit conservatory. A dormant celestial orrery rests on the potting table beneath iron ribs and fogged panes.",
    "She pulls the chair towards the locked garden door. The orrery unfolds like a flower as a copper storm lantern begins to glow.",
  ],
  nextLabels: ["Awaken the conservatory"],
};

const demoStories: readonly DemoStory[] = [atticStory, conservatoryStory];
const WorldViewer = lazy(() =>
  import("./components/WorldViewer").then((module) => ({ default: module.WorldViewer })),
);
const AssetReviewPanel = lazy(() =>
  import("./components/AssetReviewPanel").then((module) => ({ default: module.AssetReviewPanel })),
);
const experimentalAssetLabEnabled =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("assetLab") === "1";
const invalidPatch: ScenePatch = { fromVersion: 99, toVersion: 100, operations: [] };

function snapshotAt(story: DemoStory, step: number): WorldSnapshot {
  return story.patches.slice(0, step).reduce(applyScenePatch, story.snapshot);
}

function visualPlanAt(story: DemoStory, snapshotVersion: number): VisualScenePlan {
  return [...story.visualPlans]
    .filter((plan) => plan.snapshotVersion <= snapshotVersion)
    .sort((left, right) => right.snapshotVersion - left.snapshotVersion)[0] ?? story.visualPlans[0]!;
}

export default function App() {
  const [storyId, setStoryId] = useState(atticStory.id);
  const story = demoStories.find((candidate) => candidate.id === storyId) ?? atticStory;
  const [step, setStep] = useState(0);
  const [session, setSession] = useState(0);
  const [invalidPatchMode, setInvalidPatchMode] = useState(false);
  const [acknowledgedVersion, setAcknowledgedVersion] = useState(story.snapshot.version);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState(story.snapshot.locations[0]?.id ?? "");
  const [reviewRegistry, setReviewRegistry] = useState<AssetRegistry | null>(null);
  const patch = invalidPatchMode
    ? invalidPatch
    : step > 0
      ? story.patches[step - 1] ?? null
      : null;
  const visualPlan = visualPlanAt(story, acknowledgedVersion);
  const derivedSnapshot = useMemo(() => snapshotAt(story, step), [step, story]);
  const sceneRecipe = useMemo(
    () => compileSceneRecipe(derivedSnapshot, visualPlan),
    [derivedSnapshot, visualPlan],
  );

  const resetStory = (nextStory = story) => {
    setStep(0);
    setInvalidPatchMode(false);
    setSession((current) => current + 1);
    setSelectedEntityId(null);
    setReviewRegistry(null);
    setActiveLocationId(nextStory.snapshot.locations[0]?.id ?? "");
    setAcknowledgedVersion(nextStory.snapshot.version);
  };

  const unresolvedCount = sceneRecipe.coverage.designedFallback;

  return (
    <main className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Persistent StoryWorld 3D · Spatial Runtime</p>
          <h1>The same world, changed by the story.</h1>
          <p className="lede">
            Deterministic layouts and approved style kits turn different story fixtures into
            persistent explorable places—not regenerated scenes.
          </p>
          <label className="story-fixture-picker">
            <span>Renderer fixture</span>
            <select
              value={story.id}
              onChange={(event) => {
                const nextStory = demoStories.find((candidate) => candidate.id === event.target.value);
                if (!nextStory) return;
                setStoryId(nextStory.id);
                resetStory(nextStory);
              }}
            >
              {demoStories.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="version-chip" aria-live="polite">
          <span>World state</span>
          <strong>v{derivedSnapshot.version}</strong>
          <small>renderer ack v{acknowledgedVersion}</small>
          <small>visual plan v{visualPlan.planVersion}</small>
          <small>{sceneRecipe.styleKit.label}</small>
          <small>{sceneRecipe.coverage.approved}/{sceneRecipe.coverage.total} approved assets</small>
          {unresolvedCount > 0 && <small>{unresolvedCount} designed fallback</small>}
          {sceneRecipe.coverage.queuedForGeneration > 0 && (
            <small>{sceneRecipe.coverage.queuedForGeneration} hero generation job</small>
          )}
          <small>
            {sceneRecipe.status === "assets_pending"
              ? "scene ready · hero asset pending"
              : `scene recipe ${sceneRecipe.status}`}
          </small>
        </div>
      </header>

      <section className="viewer-frame" aria-label="Interactive 3D story world">
        <Suspense fallback={<div className="viewer-loading" role="status">Loading spatial runtime…</div>}>
          <WorldViewer
            key={`${story.id}-${session}`}
            snapshot={story.snapshot}
            patch={patch}
            visualPlan={visualPlan}
            sceneRecipe={sceneRecipe}
            assetRegistry={reviewRegistry ?? sceneRecipe.assetRegistry}
            activeLocationId={activeLocationId}
            selectedEntityId={selectedEntityId}
            onEntitySelect={setSelectedEntityId}
            onLocationRequest={(locationId) => {
              setActiveLocationId(locationId);
              setSelectedEntityId(null);
            }}
            onPatchApplied={(currentSnapshot) => setAcknowledgedVersion(currentSnapshot.version)}
          />
        </Suspense>
        <div className="viewer-hint">
          Left-drag to pan · Right-drag to rotate · Scroll to zoom · Double-click floor to move
        </div>
      </section>

      <section className="control-deck">
        <div className="passage-card">
          <span>Story moment {step + 1}</span>
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
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </label>
          <p>{story.passages[step]}</p>
        </div>

        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() => resetStory()}
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
              setStep((current) => Math.min(story.patches.length, current + 1));
            }}
            disabled={step >= story.patches.length}
          >
            {story.nextLabels[step] ?? "Latest moment"}
          </button>
        </div>

        <EntityInspector
          snapshot={derivedSnapshot}
          selectedEntityId={selectedEntityId}
          onEntitySelect={setSelectedEntityId}
        />
      </section>

      {experimentalAssetLabEnabled && (
        <Suspense fallback={null}>
          <AssetReviewPanel
            snapshot={derivedSnapshot}
            visualPlan={visualPlan}
            baseRegistry={sceneRecipe.assetRegistry}
            onRegistryPreview={setReviewRegistry}
          />
        </Suspense>
      )}
    </main>
  );
}
