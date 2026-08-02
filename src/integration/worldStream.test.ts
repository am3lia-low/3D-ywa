import { describe, expect, it } from "vitest";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch } from "../runtime/applyScenePatch";
import { OrderedWorldStream } from "./worldStream";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const patch2 = patch2Fixture as unknown as ScenePatch;
const patch3 = patch3Fixture as unknown as ScenePatch;

describe("ordered world stream", () => {
  it("queues burst patches and acknowledges them in viewer order", () => {
    const stream = new OrderedWorldStream(snapshot);
    expect(stream.ingestPatch(patch2).outcome).toBe("accepted");
    expect(stream.ingestPatch(patch3).outcome).toBe("accepted");
    expect(stream.pendingCount).toBe(2);

    const active2 = stream.takeNextPatch();
    expect(active2).toEqual(patch2);
    const version2 = applyScenePatch(snapshot, patch2);
    stream.acknowledge(version2, patch2);

    const active3 = stream.takeNextPatch();
    expect(active3).toEqual(patch3);
    const version3 = applyScenePatch(version2, patch3);
    stream.acknowledge(version3, patch3);

    expect(stream.currentSnapshot.version).toBe(3);
    expect(stream.pendingCount).toBe(0);
  });

  it("ignores stale and already-queued duplicate packets", () => {
    const stream = new OrderedWorldStream(snapshot);
    expect(stream.ingestPatch(patch2).outcome).toBe("accepted");
    expect(stream.ingestPatch(patch2).outcome).toBe("duplicate");

    const active = stream.takeNextPatch();
    expect(active).toEqual(patch2);
    stream.acknowledge(applyScenePatch(snapshot, patch2), patch2);
    expect(stream.ingestPatch(patch2).outcome).toBe("duplicate");
  });

  it("pauses on a version gap until a full snapshot resynchronizes it", () => {
    const stream = new OrderedWorldStream(snapshot);
    const gap: ScenePatch = { fromVersion: 3, toVersion: 4, operations: [] };

    expect(stream.ingestPatch(gap)).toMatchObject({
      outcome: "resync_required",
      expectedVersion: 1,
      receivedFromVersion: 3,
    });
    expect(stream.takeNextPatch()).toBeNull();

    const version2 = applyScenePatch(snapshot, patch2);
    const version3 = applyScenePatch(version2, patch3);
    stream.resynchronize(version3);
    expect(stream.status).toBe("ready");
    expect(stream.ingestPatch(gap).outcome).toBe("accepted");
  });

  it("rejects acknowledgements that do not match the active patch", () => {
    const stream = new OrderedWorldStream(snapshot);
    expect(() => stream.acknowledge(snapshot, patch2)).toThrow("it is not active");
  });
});
