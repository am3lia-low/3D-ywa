import { describe, expect, it } from "vitest";
import snapshotFixture from "../../fixtures/snapshot_1.json";
import patch2Fixture from "../../fixtures/patch_2.json";
import patch3Fixture from "../../fixtures/patch_3.json";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import { applyScenePatch, PatchVersionError } from "./applyScenePatch";

const snapshot = snapshotFixture as unknown as WorldSnapshot;
const patch = patch2Fixture as unknown as ScenePatch;
const patch3 = patch3Fixture as unknown as ScenePatch;

describe("applyScenePatch", () => {
  it("applies add, move, update and relation operations as one version transition", () => {
    const next = applyScenePatch(snapshot, patch);

    expect(next.version).toBe(2);
    expect(next.entities.find((entity) => entity.id === "chair-1")?.transform?.position).toEqual([
      2.25,
      0.55,
      0.75,
    ]);
    expect(next.entities.find((entity) => entity.id === "desk-1")?.state).toMatchObject({
      condition: "scratched",
    });
    expect(next.entities.some((entity) => entity.id === "lantern-1")).toBe(true);
    expect(next.relations.some((relation) => relation.id === "lantern-near-desk")).toBe(true);
    expect(next.relations.some((relation) => relation.id === "chair-near-desk")).toBe(false);
  });

  it("retains references for untouched entities so scene nodes remain stable", () => {
    const hearth = snapshot.entities.find((entity) => entity.id === "hearth-1");
    const next = applyScenePatch(snapshot, patch);

    expect(next.entities.find((entity) => entity.id === "hearth-1")).toBe(hearth);
    expect(snapshot.version).toBe(1);
  });

  it("applies the complete three-passage fixture sequence in order", () => {
    const version2 = applyScenePatch(snapshot, patch);
    const version3 = applyScenePatch(version2, patch3);

    expect(version3.version).toBe(3);
    expect(version3.entities.find((entity) => entity.id === "hearth-1")?.state).toMatchObject({
      lit: true,
    });
    expect(version3.entities.find((entity) => entity.id === "hidden-door-1")).toBeDefined();
    expect(version3.entities.find((entity) => entity.id === "lantern-1")?.transform?.position).toEqual([
      2.9,
      0.4,
      -3.7,
    ]);
  });

  it("rejects an out-of-order patch", () => {
    expect(() => applyScenePatch({ ...snapshot, version: 7 }, patch)).toThrow(PatchVersionError);
  });
});
