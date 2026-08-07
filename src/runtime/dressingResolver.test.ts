import { describe, expect, it } from "vitest";

import type { WorldSnapshot } from "../contracts/world";
import { defaultAssetRegistry } from "./assetRegistry";
import {
  resolveDressingInstances,
  URBAN_BRIDGE_CENTER_FACTORS,
  URBAN_BRIDGE_RESERVED_DEPTH,
  URBAN_FACADE_ACCESS_CLEARANCE,
  URBAN_GUTTER_CENTER_FACTOR,
  URBAN_GUTTER_RESERVED_WIDTH,
  urbanFacadeInnerEdge,
} from "./dressingResolver";
import { createWorldLayout } from "./layoutEngine";
import { createFallbackScenePresentation } from "./sceneCompiler";
import { URBAN_HUMAN_SCALE } from "./urbanComposition";

function mantelSnapshot(includeStoryClock: boolean): WorldSnapshot {
  return {
    storyId: "mantel-dedupe-story",
    version: 1,
    passageId: "P1",
    locations: [{ id: "room", name: "Historical room", bounds: [12, 4.5, 10] }],
    entities: [
      {
        id: "hearth",
        name: "Stone Fireplace",
        kind: "architecture",
        locationId: "room",
        assetKey: "fireplace",
        transform: { position: [0, 1.25, -4.5] },
      },
      ...(includeStoryClock ? [{
        id: "story-clock",
        name: "Stopped Brass Clock",
        kind: "decor" as const,
        locationId: "room",
        assetKey: "victorian-mantel-clock",
      }] : []),
    ],
    relations: includeStoryClock ? [{
      id: "story-clock:on:hearth",
      subjectId: "story-clock",
      predicate: "on",
      objectId: "hearth",
    }] : [],
    conflicts: [],
  };
}

describe("resolved dressing identity safeguards", () => {
  it("does not add a decorative clock when the story already contains one", () => {
    const withoutClock = mantelSnapshot(false);
    const withClock = mantelSnapshot(true);
    const presentation = createFallbackScenePresentation(withClock, "room");
    const mantelPresentation = {
      ...presentation,
      location: {
        ...presentation.location,
        dressingTags: ["mantel"],
        dressingDensity: "rich" as const,
      },
      dressing: { ...presentation.dressing, density: "rich" as const },
    };

    const decorativeClock = resolveDressingInstances(
      createWorldLayout(withoutClock, defaultAssetRegistry),
      mantelPresentation,
      "generic-grounded",
    );
    const deduplicated = resolveDressingInstances(
      createWorldLayout(withClock, defaultAssetRegistry),
      mantelPresentation,
      "generic-grounded",
    );

    expect(decorativeClock.some((instance) => instance.dressingId.endsWith(":mantel-clock")))
      .toBe(true);
    expect(deduplicated.some((instance) => instance.dressingId.endsWith(":mantel-clock")))
      .toBe(false);
  });

  it("keeps urban dressing clear of projecting facade architecture", () => {
    const snapshot: WorldSnapshot = {
      storyId: "urban-clearance-story",
      version: 1,
      passageId: "P1",
      locations: [{ id: "quarter", name: "Canal quarter", bounds: [24, 8, 28] }],
      entities: [],
      relations: [],
      conflicts: [],
    };
    const fallback = createFallbackScenePresentation(snapshot, "quarter");
    const presentation = {
      ...fallback,
      location: {
        ...fallback.location,
        dressingTags: ["canal-district", "street-lamps"],
        dressingDensity: "rich" as const,
      },
      architecture: {
        ...fallback.architecture,
        openAir: true,
        urbanStreet: true,
      },
      dressing: { ...fallback.dressing, density: "rich" as const },
    };

    const instances = resolveDressingInstances(
      createWorldLayout(snapshot, defaultAssetRegistry),
      presentation,
      "speculative-storybook",
    );

    expect(instances.length).toBeGreaterThanOrEqual(8);
    expect(instances.some((instance) => /market-(?:table|bench|basket)/.test(instance.dressingId)))
      .toBe(false);
    expect(instances.filter((instance) => instance.renderKind === "asset" &&
      instance.catalogId === "polyhaven:wooden-crate-02-optimized")).toHaveLength(2);
    expect(instances.filter((instance) => instance.renderKind === "asset" &&
      instance.catalogId === "polyhaven:wooden-bucket-01-optimized")).toHaveLength(2);
    expect(instances.some((instance) => instance.renderKind === "asset" &&
      instance.catalogId === "polyhaven:wooden-lantern-01-optimized" &&
      instance.supportId?.includes("rope-crate")))
      .toBe(true);
    expect(URBAN_FACADE_ACCESS_CLEARANCE).toBeGreaterThanOrEqual(0.9);
    for (const instance of instances.filter((candidate) => candidate.placementAnchor === "floor")) {
      expect(instance.position[1] - instance.dimensions[1] / 2)
        .toBeCloseTo(URBAN_HUMAN_SCALE.sidewalkSurfaceTop + (instance.verticalOffset ?? 0), 5);
      const yaw = instance.rotation[1];
      const rotatedWidth = instance.dimensions[0] * Math.abs(Math.cos(yaw)) +
        instance.dimensions[2] * Math.abs(Math.sin(yaw));
      expect(Math.abs(instance.position[0]) + rotatedWidth / 2)
        .toBeLessThanOrEqual(urbanFacadeInnerEdge(24) + 0.005);
      expect(Math.abs(Math.abs(instance.position[0]) - 24 * URBAN_GUTTER_CENTER_FACTOR))
        .toBeGreaterThanOrEqual(rotatedWidth / 2 + URBAN_GUTTER_RESERVED_WIDTH / 2 - 0.005);
      const rotatedDepth = instance.dimensions[2] * Math.abs(Math.cos(yaw)) +
        instance.dimensions[0] * Math.abs(Math.sin(yaw));
      for (const bridgeFactor of URBAN_BRIDGE_CENTER_FACTORS) {
        expect(Math.abs(instance.position[2] - 28 * bridgeFactor))
          .toBeGreaterThanOrEqual(rotatedDepth / 2 + URBAN_BRIDGE_RESERVED_DEPTH / 2 - 0.005);
      }
    }
    for (const bucket of instances.filter((candidate) => candidate.renderKind === "asset" &&
      candidate.catalogId === "polyhaven:wooden-bucket-01-optimized")) {
      expect(bucket.verticalOffset).toBeUndefined();
      expect(bucket.position[1] - bucket.dimensions[1] / 2)
        .toBeCloseTo(URBAN_HUMAN_SCALE.sidewalkSurfaceTop, 5);
    }
  });
});
