import { useCallback, useRef, useState } from "react";
import {
  validateScenePatch,
  validateWorldSnapshot,
} from "../contracts/validation";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";

export type WorldStreamStatus = "ready" | "resync_required";

export type PatchIngestResult =
  | { outcome: "accepted"; expectedVersion: number }
  | { outcome: "duplicate"; expectedVersion: number }
  | {
      outcome: "resync_required";
      expectedVersion: number;
      receivedFromVersion: number;
    };

/**
 * Orders patches before they reach WorldViewer and pauses on version gaps until
 * a full snapshot resynchronizes the stream.
 */
export class OrderedWorldStream {
  private snapshot: WorldSnapshot;
  private queue: ScenePatch[] = [];
  private activePatch: ScenePatch | null = null;
  private streamStatus: WorldStreamStatus = "ready";

  constructor(initialSnapshot: WorldSnapshot) {
    this.snapshot = validateWorldSnapshot(initialSnapshot);
  }

  get currentSnapshot(): WorldSnapshot {
    return this.snapshot;
  }

  get status(): WorldStreamStatus {
    return this.streamStatus;
  }

  get pendingCount(): number {
    return this.queue.length + (this.activePatch ? 1 : 0);
  }

  get expectedVersion(): number {
    return (
      this.queue.at(-1)?.toVersion ??
      this.activePatch?.toVersion ??
      this.snapshot.version
    );
  }

  ingestPatch(input: ScenePatch): PatchIngestResult {
    const patch = validateScenePatch(input);
    const expectedVersion = this.expectedVersion;

    if (
      patch.toVersion <= this.snapshot.version ||
      [this.activePatch, ...this.queue].some(
        (known) =>
          known?.fromVersion === patch.fromVersion && known.toVersion === patch.toVersion,
      )
    ) {
      return { outcome: "duplicate", expectedVersion };
    }

    if (this.streamStatus === "resync_required" || patch.fromVersion !== expectedVersion) {
      this.streamStatus = "resync_required";
      return {
        outcome: "resync_required",
        expectedVersion,
        receivedFromVersion: patch.fromVersion,
      };
    }

    this.queue.push(patch);
    return { outcome: "accepted", expectedVersion: patch.toVersion };
  }

  takeNextPatch(): ScenePatch | null {
    if (this.streamStatus !== "ready" || this.activePatch) return null;
    this.activePatch = this.queue.shift() ?? null;
    return this.activePatch;
  }

  acknowledge(appliedSnapshot: WorldSnapshot, appliedPatch: ScenePatch): void {
    const snapshot = validateWorldSnapshot(appliedSnapshot);
    if (
      !this.activePatch ||
      this.activePatch.fromVersion !== appliedPatch.fromVersion ||
      this.activePatch.toVersion !== appliedPatch.toVersion
    ) {
      throw new Error(
        `Cannot acknowledge patch ${appliedPatch.fromVersion}→${appliedPatch.toVersion}; it is not active.`,
      );
    }
    if (
      snapshot.storyId !== this.snapshot.storyId ||
      snapshot.version !== appliedPatch.toVersion
    ) {
      throw new Error("The acknowledged snapshot does not match the active stream patch.");
    }
    this.snapshot = snapshot;
    this.activePatch = null;
  }

  resynchronize(input: WorldSnapshot): WorldSnapshot {
    this.snapshot = validateWorldSnapshot(input);
    this.queue = [];
    this.activePatch = null;
    this.streamStatus = "ready";
    return this.snapshot;
  }
}

export interface WorldStreamBinding {
  /** Snapshot used to mount or explicitly resynchronize WorldViewer. */
  snapshot: WorldSnapshot;
  /** Latest acknowledged world state for inspectors and surrounding UI. */
  currentSnapshot: WorldSnapshot;
  patch: ScenePatch | null;
  status: WorldStreamStatus;
  pendingCount: number;
  ingestPatch: (patch: ScenePatch) => PatchIngestResult;
  resynchronize: (snapshot: WorldSnapshot) => void;
  onPatchApplied: (snapshot: WorldSnapshot, patch: ScenePatch) => void;
}

/** React binding for feeding ordered transport packets into WorldViewer. */
export function useWorldStream(initialSnapshot: WorldSnapshot): WorldStreamBinding {
  const controller = useRef<OrderedWorldStream>(null);
  controller.current ??= new OrderedWorldStream(initialSnapshot);
  const [snapshot, setSnapshot] = useState(controller.current.currentSnapshot);
  const [currentSnapshot, setCurrentSnapshot] = useState(controller.current.currentSnapshot);
  const [patch, setPatch] = useState<ScenePatch | null>(null);
  const [status, setStatus] = useState<WorldStreamStatus>(controller.current.status);
  const [pendingCount, setPendingCount] = useState(controller.current.pendingCount);

  const syncDiagnostics = useCallback(() => {
    setStatus(controller.current?.status ?? "ready");
    setPendingCount(controller.current?.pendingCount ?? 0);
  }, []);

  const pump = useCallback(() => {
    const next = controller.current?.takeNextPatch();
    if (next) setPatch(next);
    syncDiagnostics();
  }, [syncDiagnostics]);

  const ingestPatch = useCallback(
    (nextPatch: ScenePatch) => {
      const result = controller.current!.ingestPatch(nextPatch);
      if (result.outcome === "accepted") pump();
      else syncDiagnostics();
      return result;
    },
    [pump, syncDiagnostics],
  );

  const resynchronize = useCallback(
    (nextSnapshot: WorldSnapshot) => {
      const validated = controller.current!.resynchronize(nextSnapshot);
      setSnapshot(validated);
      setCurrentSnapshot(validated);
      setPatch(null);
      syncDiagnostics();
    },
    [syncDiagnostics],
  );

  const onPatchApplied = useCallback(
    (appliedSnapshot: WorldSnapshot, appliedPatch: ScenePatch) => {
      controller.current!.acknowledge(appliedSnapshot, appliedPatch);
      setCurrentSnapshot(appliedSnapshot);
      const next = controller.current!.takeNextPatch();
      setPatch(next);
      syncDiagnostics();
    },
    [syncDiagnostics],
  );

  return {
    snapshot,
    currentSnapshot,
    patch,
    status,
    pendingCount,
    ingestPatch,
    resynchronize,
    onPatchApplied,
  };
}
