import { useEffect, useMemo, useState } from "react";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import type { AssetRegistry } from "../runtime/assetRegistry";
import {
  AsyncSceneBuildOrchestrator,
  createDeterministicMockSceneAssetProvider,
  createWebStorageSceneBuildStore,
  type AsyncSceneBuildRecord,
} from "../runtime/sceneBuildOrchestrator";
import "./SceneBuildDiagnostics.css";

export interface SceneBuildDiagnosticsProps {
  snapshot: WorldSnapshot;
  visualPlan: VisualScenePlan;
  onRegistryPreview: (registry: AssetRegistry | null) => void;
}

export function SceneBuildDiagnostics({
  snapshot,
  visualPlan,
  onRegistryPreview,
}: SceneBuildDiagnosticsProps) {
  const provider = useMemo(createDeterministicMockSceneAssetProvider, []);
  const orchestrator = useMemo(
    () => new AsyncSceneBuildOrchestrator(createWebStorageSceneBuildStore(window.localStorage)),
    [],
  );
  const [record, setRecord] = useState<AsyncSceneBuildRecord | null>(null);
  const [cacheHit, setCacheHit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Queue this scene to inspect the Part 2 asynchronous build lifecycle.",
  );

  useEffect(() => {
    setRecord(null);
    setCacheHit(false);
    setMessage("Queue this scene to inspect the Part 2 asynchronous build lifecycle.");
    onRegistryPreview(null);
  }, [snapshot.storyId, snapshot.version, visualPlan.planVersion, onRegistryPreview]);

  const runTask = async (task: () => Promise<AsyncSceneBuildRecord>, success: string) => {
    setBusy(true);
    try {
      const next = await task();
      setRecord(next);
      setMessage(success.replace("{status}", next.status));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const queue = async () => {
    setBusy(true);
    try {
      const result = await orchestrator.queue(snapshot, visualPlan, provider.id);
      setRecord(result.record);
      setCacheHit(result.cacheHit);
      setMessage(
        result.cacheHit
          ? `Loaded cached ${result.record.status} build.`
          : "Queued a new deterministic build record.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const candidate = record?.candidates.find((item) =>
    ["awaiting_review", "failed", "rejected", "queued"].includes(item.status),
  ) ?? record?.candidates[0];

  const preview = async () => {
    if (!record || !candidate) return;
    setBusy(true);
    try {
      const result = await orchestrator.preview(record, candidate.entityId);
      setRecord(result.record);
      onRegistryPreview(result.assetRegistry);
      setMessage(`Previewing ${candidate.entityId}; approval is now unlocked.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const review = async (decision: "approved" | "rejected") => {
    if (!record || !candidate) return;
    await runTask(
      async () => {
        const next = await orchestrator.review(record, candidate.entityId, decision);
        onRegistryPreview(decision === "approved" ? next.manifest.assetRegistry : null);
        return next;
      },
      decision === "approved"
        ? "Approved and promoted the previewed candidate; build is {status}."
        : "Rejected the candidate; build is {status}.",
    );
  };

  return (
    <details className="scene-build-diagnostics">
      <summary>Part 2 scene-build diagnostics</summary>
      <div className="scene-build-diagnostics__header">
        <div>
          <span>Build state</span>
          <strong>{record?.status ?? "not queued"}</strong>
        </div>
        {cacheHit && <span className="scene-build-diagnostics__cache">cache hit</span>}
      </div>

      {record && (
        <div className="scene-build-diagnostics__progress">
          <span>{record.progress.approvedLibraryAssets}/{record.progress.totalEntities} library assets</span>
          <span>{record.progress.generationJobs} generation jobs</span>
          <span>{record.progress.awaitingReview} awaiting review</span>
          <span>{record.progress.approvedGeneratedAssets} promoted</span>
          <code title={record.cacheKey}>{record.cacheKey.slice(-18)}</code>
        </div>
      )}

      {candidate && (
        <div className="scene-build-diagnostics__candidate">
          <span>Candidate</span>
          <strong>{candidate.entityId}</strong>
          <small>{candidate.status.replaceAll("_", " ")}</small>
          {candidate.error && <small className="error">{candidate.error}</small>}
        </div>
      )}

      <div className="scene-build-diagnostics__actions">
        {!record && <button type="button" disabled={busy} onClick={() => void queue()}>Queue scene build</button>}
        {record?.status === "queued" && (
          <button type="button" disabled={busy} onClick={() => void runTask(
            () => orchestrator.run(record, provider),
            "Mock worker paused at {status}.",
          )}>Run deterministic mock worker</button>
        )}
        {record?.status === "reviewing" && candidate?.status === "awaiting_review" && (
          <>
            <button type="button" className="secondary" disabled={busy} onClick={() => void preview()}>
              Preview candidate in world
            </button>
            <button
              type="button"
              disabled={busy || !candidate.previewedAt}
              onClick={() => void review("approved")}
            >
              Approve and promote
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void review("rejected")}>
              Reject
            </button>
          </>
        )}
        {(candidate?.status === "failed" || candidate?.status === "rejected") && record && (
          <button type="button" disabled={busy} onClick={() => void runTask(
            () => orchestrator.retry(record, candidate.entityId),
            "Candidate returned to {status}.",
          )}>Retry candidate</button>
        )}
        {record?.status === "ready" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onRegistryPreview(record.manifest.assetRegistry);
              setMessage("Using the cached approved build in the live viewer.");
            }}
          >
            Use ready build
          </button>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => {
            onRegistryPreview(null);
            setMessage("Viewer restored to its current approved-library registry.");
          }}
        >
          Use library registry
        </button>
      </div>

      <p className="scene-build-diagnostics__note">
        The mock provider proves orchestration only. Its candidate cannot enter the build manifest
        until the exact artifact is previewed and approved.
      </p>
      <p className="scene-build-diagnostics__status" role="status" aria-live="polite">
        {busy ? "Working… " : ""}{message}
      </p>
    </details>
  );
}
