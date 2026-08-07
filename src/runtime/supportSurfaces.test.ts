import { describe, expect, it } from "vitest";

import {
  boxBottomY,
  boxRestsOnSupport,
  centerYForSurfaceContact,
  supportPlaneWorldY,
} from "./supportSurfaces";
import {
  URBAN_HUMAN_SCALE,
  URBAN_SIDEWALK_CENTER_FACTOR,
  urbanWalkableSurfaceTop,
} from "./urbanComposition";

describe("support surfaces", () => {
  it("uses the rendered sidewalk plane only inside the raised side bands", () => {
    const width = 24;
    const sidewalkCenter = width * URBAN_SIDEWALK_CENTER_FACTOR;

    expect(urbanWalkableSurfaceTop(width, sidewalkCenter))
      .toBe(URBAN_HUMAN_SCALE.sidewalkSurfaceTop);
    expect(urbanWalkableSurfaceTop(width, -sidewalkCenter))
      .toBe(URBAN_HUMAN_SCALE.sidewalkSurfaceTop);
    expect(urbanWalkableSurfaceTop(width, 0))
      .toBe(URBAN_HUMAN_SCALE.streetSurfaceTop);
  });

  it("places a box bottom exactly on its selected surface", () => {
    const dimensions: [number, number, number] = [0.5, 0.52, 0.45];
    const position: [number, number, number] = [2, centerYForSurfaceContact(0.19, dimensions, [1, 1, 1], 0), 1];

    expect(boxBottomY({ position, dimensions })).toBeCloseTo(0.19, 6);
  });

  it("honors a measured support plane and scaled support height", () => {
    expect(supportPlaneWorldY({
      position: [0, 0.5, 0],
      dimensions: [2, 1, 1],
      scale: [1, 1.4, 1],
      supportSurfaceY: 0.8,
    })).toBeCloseTo(0.92, 6);
  });

  it("accepts rotated contained props and rejects visible overhang", () => {
    const support = {
      position: [1, 0.45, -2] as [number, number, number],
      dimensions: [2.2, 0.9, 1.2] as [number, number, number],
      rotation: [0, Math.PI / 4, 0] as [number, number, number],
      supportSurfaceY: 1,
    };
    const subjectDimensions: [number, number, number] = [0.5, 0.1, 0.32];
    const subjectY = centerYForSurfaceContact(supportPlaneWorldY(support), subjectDimensions);

    expect(boxRestsOnSupport({
      position: [1, subjectY, -2],
      dimensions: subjectDimensions,
      rotation: [0, Math.PI / 2, 0],
    }, support)).toBe(true);
    expect(boxRestsOnSupport({
      position: [2.4, subjectY, -2],
      dimensions: subjectDimensions,
      rotation: [0, Math.PI / 2, 0],
    }, support)).toBe(false);
  });
});
