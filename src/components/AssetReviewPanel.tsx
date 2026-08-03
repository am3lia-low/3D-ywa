import { useEffect, useMemo, useState } from "react";

import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import type { AssetRegistry } from "../runtime/assetRegistry";
import {
  buildRegenerationManifest,
  createInlineSurfaceTemplateProvider,
} from "../runtime/assetReviewSession";
import { createComfyUiReferenceImageProvider } from "../runtime/comfyUiReferenceImageProvider";
import {
  createReferenceImageIntegrityValidator,
  createSceneAssetQueue,
  createSceneAssetReconstructionRouter,
  generateSceneAssetReferences,
  promoteReadySceneAssets,
  reconstructApprovedSceneAssets,
  reviewReconstructedSceneAsset,
  reviewSceneAssetCandidate,
  retrySceneAsset,
  type SceneAssetQueue,
  type SceneAssetQueueStore,
} from "../runtime/sceneAssetQueue";
import { createTripoSrReconstructionProvider } from "../runtime/tripoSrProvider";
import "./AssetReviewPanel.css";

const STORAGE_KEY = "storyworld:active-asset-review:v1";

function localQueueStore(): SceneAssetQueueStore {
  return {
    async load() {
      const serialized = window.localStorage.getItem(STORAGE_KEY);
      return serialized ? (JSON.parse(serialized) as SceneAssetQueue) : undefined;
    },
    async save(queue) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    },
  };
}

export interface AssetReviewPanelProps {
  snapshot: WorldSnapshot;
  visualPlan: VisualScenePlan;
  baseRegistry: AssetRegistry;
  onRegistryPreview: (registry: AssetRegistry | null) => void;
}

export function AssetReviewPanel({
  snapshot,
  visualPlan,
  baseRegistry,
  onRegistryPreview,
}: AssetReviewPanelProps) {
  const store = useMemo(localQueueStore, []);
  const availableEntityIds = useMemo(() => {
    const canonicalIds = new Set(snapshot.entities.map((entity) => entity.id));
    return visualPlan.entities
      .map((entity) => entity.entityId)
      .filter((entityId) => canonicalIds.has(entityId));
  }, [snapshot, visualPlan]);
  const [targetEntityId, setTargetEntityId] = useState(availableEntityIds[0] ?? "");
  const [queue, setQueue] = useState<SceneAssetQueue | null>(null);
  const [comfyEndpoint, setComfyEndpoint] = useState("http://127.0.0.1:8190");
  const [tripoEndpoint, setTripoEndpoint] = useState("http://127.0.0.1:8123");
  const [seedOffset, setSeedOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Choose an entity to regenerate without replacing its canonical story identity.");

  useEffect(() => {
    void store.load("active").then((saved) => {
      if (saved) {
        setQueue(saved);
        const savedEntityId = saved.items[0]?.entityId;
        if (savedEntityId && availableEntityIds.includes(savedEntityId)) {
          setTargetEntityId(savedEntityId);
        }
      }
    });
  }, [availableEntityIds, store]);

  useEffect(() => {
    if (!availableEntityIds.includes(targetEntityId)) {
      setTargetEntityId(availableEntityIds[0] ?? "");
    }
  }, [availableEntityIds, targetEntityId]);

  const item = queue?.items[0];
  const manifestResult = useMemo(() => {
    if (!item) return { manifest: null, error: null };
    if (
      queue?.snapshotVersion !== snapshot.version ||
      queue.planVersion !== visualPlan.planVersion ||
      queue.storyId !== snapshot.storyId ||
      queue.segmentId !== visualPlan.segmentId
    ) {
      return {
        manifest: null,
        error: "This saved job belongs to an older story or visual-plan version. Queue it again for the current passage.",
      };
    }
    try {
      return {
        manifest: buildRegenerationManifest(snapshot, visualPlan, item.entityId, baseRegistry),
        error: null,
      };
    } catch (error) {
      return {
        manifest: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [baseRegistry, item, queue, snapshot, visualPlan]);

  const run = async (label: string, task: () => Promise<SceneAssetQueue>) => {
    setBusy(true);
    setMessage(label);
    try {
      const next = await task();
      setQueue(next);
      setMessage(`Done. Asset is now ${next.items[0]?.stage.replaceAll("_", " ")}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const queueEntity = async () => {
    setBusy(true);
    try {
      const manifest = buildRegenerationManifest(
        snapshot,
        visualPlan,
        targetEntityId,
        baseRegistry,
      );
      const next = createSceneAssetQueue(manifest);
      await store.save(next);
      setQueue(next);
      onRegistryPreview(null);
      setMessage("Queued. Generate a reference image when ComfyUI is running.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const previewGenerated = () => {
    if (!item?.generated) return;
    onRegistryPreview({ ...baseRegistry, [item.entityId]: item.generated.asset });
    setMessage("Previewing the reconstructed candidate in the world above.");
  };

  const promote = () => {
    if (!queue || !manifestResult.manifest) return;
    const promoted = promoteReadySceneAssets(manifestResult.manifest, queue);
    onRegistryPreview(promoted.assetRegistry);
    setMessage("Approved candidate promoted into this live world session.");
  };

  const candidateUrl = item?.candidate
    ? `data:${item.candidate.mimeType};base64,${item.candidate.base64}`
    : undefined;
  const staleQueue = Boolean(item && !manifestResult.manifest);

  return (
    <section className="asset-review" aria-labelledby="asset-review-heading">
      <header className="asset-review__header">
        <div>
          <p className="eyebrow">Async visual pipeline</p>
          <h2 id="asset-review-heading">Generate, inspect, then promote</h2>
        </div>
        <span className={`asset-review__stage asset-review__stage--${item?.stage ?? "idle"}`}>
          {item?.stage.replaceAll("_", " ") ?? "idle"}
        </span>
      </header>

      <div className="asset-review__setup">
        <label>
          <span>Entity</span>
          <select
            value={targetEntityId}
            onChange={(event) => setTargetEntityId(event.target.value)}
            disabled={busy}
          >
            {availableEntityIds.map((entityId) => (
              <option key={entityId} value={entityId}>{entityId}</option>
            ))}
          </select>
        </label>
        <label>
          <span>ComfyUI</span>
          <input value={comfyEndpoint} onChange={(event) => setComfyEndpoint(event.target.value)} />
        </label>
        <label>
          <span>TripoSR</span>
          <input value={tripoEndpoint} onChange={(event) => setTripoEndpoint(event.target.value)} />
        </label>
        <label className="asset-review__seed">
          <span>Variation</span>
          <input
            type="number"
            min="0"
            step="1"
            value={seedOffset}
            onChange={(event) => setSeedOffset(Math.max(0, Math.trunc(Number(event.target.value))))}
          />
        </label>
        <button type="button" onClick={() => void queueEntity()} disabled={busy || !targetEntityId}>
          Queue regeneration
        </button>
      </div>

      {item && (
        <div className="asset-review__workspace">
          <div className="asset-review__candidate">
            {candidateUrl ? (
              <img src={candidateUrl} alt={`Generated reference for ${item.entityId}`} />
            ) : (
              <div className="asset-review__empty">Reference image will appear here</div>
            )}
          </div>

          <div className="asset-review__details">
            <strong>{item.entityId}</strong>
            <p className="asset-review__prompt">{item.job.prompt}</p>
            <dl>
              <div><dt>Route</dt><dd>{item.job.strategy.replaceAll("_", " ")}</dd></div>
              <div><dt>Reference tries</dt><dd>{item.referenceAttempts}</dd></div>
              <div><dt>Build tries</dt><dd>{item.reconstructionAttempts}</dd></div>
            </dl>
            {item.error && <p className="asset-review__error">{item.error}</p>}
            {item.validation?.reasons.map((reason) => (
              <p className="asset-review__error" key={reason}>{reason}</p>
            ))}
            {staleQueue && <p className="asset-review__error">{manifestResult.error}</p>}

            <div className="asset-review__actions">
              {item.stage === "queued" && (
                <button
                  type="button"
                  disabled={busy || staleQueue}
                  onClick={() => void run("Generating reference in ComfyUI…", () =>
                    generateSceneAssetReferences(
                      queue!,
                      createComfyUiReferenceImageProvider({ endpoint: comfyEndpoint, seedOffset }),
                      { store, validator: createReferenceImageIntegrityValidator() },
                    ))}
                >
                  Generate reference
                </button>
              )}
              {item.stage === "needs_review" && (
                <>
                  <button type="button" disabled={busy} onClick={() => void run("Approving reference…", () => reviewSceneAssetCandidate(queue!, item.entityId, "approved", { store }))}>Approve reference</button>
                  <button type="button" className="danger" disabled={busy} onClick={() => void run("Rejecting reference…", () => reviewSceneAssetCandidate(queue!, item.entityId, "rejected", { store, note: "Rejected in visual review" }))}>Reject</button>
                </>
              )}
              {item.stage === "approved" && (
                <button
                  type="button"
                  disabled={busy || staleQueue}
                  onClick={() => void run("Building runtime asset…", () =>
                    reconstructApprovedSceneAssets(
                      queue!,
                      createSceneAssetReconstructionRouter({
                        image_to_mesh: createTripoSrReconstructionProvider({ endpoint: tripoEndpoint, meshResolution: 192 }),
                        surface_template: createInlineSurfaceTemplateProvider(),
                      }),
                      { store },
                    ))}
                >
                  Build runtime asset
                </button>
              )}
              {item.stage === "needs_asset_review" && (
                <>
                  <button type="button" className="secondary" onClick={previewGenerated}>Preview in world</button>
                  <button type="button" disabled={busy} onClick={() => void run("Approving runtime asset…", () => reviewReconstructedSceneAsset(queue!, item.entityId, "approved", { store }))}>Approve asset</button>
                  <button type="button" className="danger" disabled={busy} onClick={() => void run("Rejecting runtime asset…", () => reviewReconstructedSceneAsset(queue!, item.entityId, "rejected", { store, note: "Rejected in runtime review" }))}>Reject</button>
                </>
              )}
              {(item.stage === "rejected" || item.stage === "failed") && (
                <button type="button" disabled={busy} onClick={() => void run("Preparing retry…", () => retrySceneAsset(queue!, item.entityId, { store }))}>Retry</button>
              )}
              {item.stage === "ready" && (
                <>
                  <button type="button" className="secondary" onClick={previewGenerated}>Preview in world</button>
                  <button type="button" disabled={staleQueue} onClick={promote}>Promote approved asset</button>
                </>
              )}
              <button type="button" className="secondary" onClick={() => { onRegistryPreview(null); setMessage("Restored the current live registry."); }}>Use live registry</button>
            </div>
          </div>
        </div>
      )}

      <p className="asset-review__status" role="status" aria-live="polite">
        {busy && <span className="asset-review__spinner" aria-hidden="true" />}
        {message}
      </p>
    </section>
  );
}
