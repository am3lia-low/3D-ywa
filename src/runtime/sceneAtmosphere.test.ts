import { describe, expect, it } from "vitest";
import courtyardPlanFixture from "../../fixtures/visual_scene_plan_courtyard_1.json";
import courtyardSnapshotFixture from "../../fixtures/snapshot_courtyard_1.json";
import woodlandPlanFixture from "../../fixtures/visual_scene_plan_woodland_1.json";
import woodlandSnapshotFixture from "../../fixtures/snapshot_woodland_1.json";
import conservatoryPlanFixture from "../../fixtures/visual_scene_plan_conservatory_1.json";
import conservatorySnapshotFixture from "../../fixtures/snapshot_conservatory_1.json";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import { compileScenePresentation } from "./sceneCompiler";
import { createSceneAtmosphereProfile } from "./sceneAtmosphere";

function profile(planValue: unknown, snapshotValue: unknown, locationId: string) {
  const snapshot = snapshotValue as WorldSnapshot;
  const presentation = compileScenePresentation(
    planValue as VisualScenePlan,
    snapshot,
    locationId,
  );
  const bounds = snapshot.locations.find((location) => location.id === locationId)?.bounds;
  if (!bounds) throw new Error(`Missing bounds for ${locationId}.`);
  return createSceneAtmosphereProfile(presentation, bounds);
}

describe("scene atmosphere", () => {
  it("keeps rain-muted courtyards open and softly shadowed", () => {
    const result = profile(
      courtyardPlanFixture,
      courtyardSnapshotFixture,
      "coaching-courtyard",
    );
    expect(result).toMatchObject({
      family: "courtyard",
      openAir: true,
      night: false,
      sky: { cloudiness: 0.9 },
    });
    expect(result.fogFar).toBeGreaterThan(result.fogNear);
    expect(result.contactShadow.scale).toBeGreaterThan(34);
  });

  it("gives woodland more depth and softer ground contact than masonry", () => {
    const woodland = profile(
      woodlandPlanFixture,
      woodlandSnapshotFixture,
      "mosswood-path",
    );
    const courtyard = profile(
      courtyardPlanFixture,
      courtyardSnapshotFixture,
      "coaching-courtyard",
    );
    expect(woodland.family).toBe("woodland");
    expect(woodland.contactShadow.blur).toBeGreaterThan(courtyard.contactShadow.blur);
    expect(woodland.fogFar).toBeGreaterThan(woodland.fogNear);
  });

  it("recognizes moonlit glasshouses and raises cinematic night exposure", () => {
    const result = profile(
      conservatoryPlanFixture,
      conservatorySnapshotFixture,
      "moonlit-conservatory",
    );
    expect(result).toMatchObject({ family: "glasshouse", openAir: false, night: true });
    expect(result.exposure).toBeGreaterThan(1.08);
  });
});
