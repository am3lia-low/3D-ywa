import { lazy, Suspense, useMemo, useState } from "react";
import { EntityInspector } from "./components/EntityInspector";
import { Part1ConnectionPanel } from "./components/Part1ConnectionPanel";
import { SceneBuildDiagnostics } from "./components/SceneBuildDiagnostics";
import type { VisualScenePlan } from "./contracts/visualScenePlan";
import type { ScenePatch, WorldSnapshot } from "./contracts/world";
import {
  parseStoryPackageJson,
  runtimeStoryFromPackage,
  type RuntimeStory,
} from "./integration/storyPackage";
import { builtInStories } from "./data/builtInStories";
import { applyScenePatch } from "./runtime/applyScenePatch";
import type { AssetRegistry } from "./runtime/assetRegistry";
import { compileSceneRecipe } from "./runtime/sceneRecipeCompiler";

const WorldViewer = lazy(() =>
  import("./components/WorldViewer").then((module) => ({ default: module.WorldViewer })),
);
const AssetReviewPanel = lazy(() =>
  import("./components/AssetReviewPanel").then((module) => ({ default: module.AssetReviewPanel })),
);
const experimentalAssetLabEnabled =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("assetLab") === "1";
const invalidPatch: ScenePatch = { fromVersion: 99, toVersion: 100, operations: [] };
const defaultStory = builtInStories[0]!;

function snapshotAt(story: RuntimeStory, step: number): WorldSnapshot {
  return story.patches.slice(0, step).reduce(applyScenePatch, story.snapshot);
}

function visualPlanAt(story: RuntimeStory, snapshotVersion: number): VisualScenePlan {
  return [...story.visualPlans]
    .filter((plan) => plan.snapshotVersion <= snapshotVersion)
    .sort((left, right) => right.snapshotVersion - left.snapshotVersion)[0] ?? story.visualPlans[0]!;
}

export default function App() {
  const [stories, setStories] = useState<RuntimeStory[]>(() => [...builtInStories]);
  const [storyId, setStoryId] = useState(defaultStory.id);
  const story = stories.find((candidate) => candidate.id === storyId) ?? defaultStory;
  const [step, setStep] = useState(0);
  const [session, setSession] = useState(0);
  const [invalidPatchMode, setInvalidPatchMode] = useState(false);
  const [acknowledgedVersion, setAcknowledgedVersion] = useState(story.snapshot.version);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState(story.snapshot.locations[0]?.id ?? "");
  const [reviewRegistry, setReviewRegistry] = useState<AssetRegistry | null>(null);
  const [packageNotice, setPackageNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
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

  const importStoryPackage = async (file: File, input: HTMLInputElement) => {
    try {
      if (file.size > 2_000_000) throw new Error("Story packages must be 2 MB or smaller.");
      const imported = runtimeStoryFromPackage(parseStoryPackageJson(await file.text()));
      setStories((current) => [
        ...current.filter((candidate) => candidate.id !== imported.id),
        imported,
      ]);
      setStoryId(imported.id);
      resetStory(imported);
      setPackageNotice({
        kind: "success",
        message: `Loaded ${imported.label}: ${imported.passages.length} story moments.`,
      });
    } catch (error) {
      setPackageNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      input.value = "";
    }
  };

  const updateLiveStory = (nextStory: RuntimeStory) => {
    const continuesMountedStory =
      story.id === nextStory.id && nextStory.patches.length === story.patches.length + 1;
    setStories((current) => [
      ...current.filter((candidate) => candidate.id !== nextStory.id),
      nextStory,
    ]);
    setStoryId(nextStory.id);
    setInvalidPatchMode(false);
    setSelectedEntityId(null);
    setReviewRegistry(null);
    setStep(nextStory.patches.length);

    if (!continuesMountedStory) {
      setSession((current) => current + 1);
      setActiveLocationId(nextStory.snapshot.locations[0]?.id ?? "");
      setAcknowledgedVersion(nextStory.snapshot.version);
    }
  };

  const advancePassage = () => {
    setInvalidPatchMode(false);
    setReviewRegistry(null);
    setStep((current) => Math.min(story.patches.length, current + 1));
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
                const nextStory = stories.find((candidate) => candidate.id === event.target.value);
                if (!nextStory) return;
                setStoryId(nextStory.id);
                resetStory(nextStory);
              }}
            >
              {stories.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
              ))}
            </select>
          </label>
          <div className="story-package-controls">
            <label className="story-package-import">
              Import story package
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void importStoryPackage(file, event.currentTarget);
                }}
              />
            </label>
            {packageNotice && (
              <p
                className={`story-package-notice ${packageNotice.kind}`}
                role={packageNotice.kind === "error" ? "alert" : "status"}
              >
                {packageNotice.message}
              </p>
            )}
          </div>
        </div>
        <div className="version-chip" aria-live="polite">
          <span>World state</span>
          <strong>v{derivedSnapshot.version}</strong>
          <small>renderer ack v{acknowledgedVersion}</small>
          <small>visual plan v{visualPlan.planVersion}</small>
          <small>{sceneRecipe.styleKit.label}</small>
          <small>{sceneRecipe.coverage.approved}/{sceneRecipe.coverage.total} approved library assets</small>
          {unresolvedCount > 0 && <small>{unresolvedCount} designed fallback in base recipe</small>}
          {sceneRecipe.coverage.queuedForGeneration > 0 && (
            <small>{sceneRecipe.coverage.queuedForGeneration} offline hero job</small>
          )}
          <small>
            {`scene recipe ${sceneRecipe.status}`}
          </small>
          <small>
            {`composition ${sceneRecipe.composition.status} · ${sceneRecipe.composition.score}/100`}
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
            onPassageAdvance={advancePassage}
            passageActionLabel={story.nextLabels[step] ?? "Latest moment"}
            passageActionDisabled={step >= story.patches.length}
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
            onClick={advancePassage}
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

      <SceneBuildDiagnostics
        snapshot={derivedSnapshot}
        visualPlan={visualPlan}
        onRegistryPreview={setReviewRegistry}
      />

      <Part1ConnectionPanel onStoryUpdate={updateLiveStory} />

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
