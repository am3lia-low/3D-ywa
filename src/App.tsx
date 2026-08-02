import { useMemo, useState } from "react";
import snapshotFixture from "../fixtures/snapshot_1.json";
import patch2Fixture from "../fixtures/patch_2.json";
import patch3Fixture from "../fixtures/patch_3.json";
import { WorldViewer } from "./components";
import type { ScenePatch, WorldSnapshot } from "./contracts/world";
import { applyScenePatch } from "./runtime/applyScenePatch";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const patch2 = patch2Fixture as unknown as ScenePatch;
const patch3 = patch3Fixture as unknown as ScenePatch;
const invalidPatch: ScenePatch = {
  fromVersion: 99,
  toVersion: 100,
  operations: [],
};

export default function App() {
  const [step, setStep] = useState(0);
  const [session, setSession] = useState(0);
  const [invalidPatchMode, setInvalidPatchMode] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const patch = invalidPatchMode ? invalidPatch : step === 1 ? patch2 : step === 2 ? patch3 : null;
  const derivedSnapshot = useMemo(() => {
    if (step === 0) return snapshot;
    const version2 = applyScenePatch(snapshot, patch2);
    return step === 1 ? version2 : applyScenePatch(version2, patch3);
  }, [step]);
  const selected = derivedSnapshot.entities.find((entity) => entity.id === selectedEntityId);

  const reset = () => {
    setStep(0);
    setInvalidPatchMode(false);
    setSession((current) => current + 1);
    setSelectedEntityId(null);
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
        </div>
      </header>

      <section className="viewer-frame" aria-label="Interactive 3D story world">
        <WorldViewer
          key={session}
          snapshot={snapshot}
          patch={patch}
          selectedEntityId={selectedEntityId}
          onEntitySelect={setSelectedEntityId}
        />
        <div className="viewer-hint">Drag to orbit · Scroll to zoom · Select an object</div>
      </section>

      <section className="control-deck">
        <div className="passage-card">
          <span>Passage {step + 1}</span>
          <p>
            {step === 0 && "The attic study is established: desk, chair, hearth and worn rug."}
            {step === 1 && "The chair has moved. A brass lantern now waits beside the desk."}
            {step === 2 && "Firelight reveals a narrow hidden door in the north wall."}
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
              setStep((current) => Math.min(2, current + 1));
              setSelectedEntityId(null);
            }}
            disabled={step === 2}
          >
            {step === 0 ? "Apply passage 2" : "Reveal passage 3"}
          </button>
        </div>

        <aside className="selection-card" aria-live="polite">
          <span>Selected entity</span>
          <strong>{selected?.name ?? "None"}</strong>
          <small>{selected ? `${selected.id} · ${selected.assetKey ?? "fallback primitive"}` : "Click an object in the room"}</small>
        </aside>
      </section>
    </main>
  );
}
