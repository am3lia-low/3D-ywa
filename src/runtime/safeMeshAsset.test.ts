import { describe, expect, it } from "vitest";
import { validateSafeMeshAsset } from "./safeMeshAsset";

const validAsset = {
  schemaVersion: "1.0",
  label: "Tiny triangle",
  sourceSha256: "a".repeat(64),
  normalization: "unit-box-grounded-y",
  meshes: [{
    name: "triangle",
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2],
    groups: [{ start: 0, count: 3, materialIndex: 0 }],
    materials: [{ color: "#446644", roughness: 0.9, metalness: 0, doubleSided: false }],
  }],
};

describe("safe mesh assets", () => {
  it("accepts bounded converted geometry", () => {
    expect(validateSafeMeshAsset(validAsset).meshes).toHaveLength(1);
  });

  it("rejects malformed vertex data", () => {
    expect(() => validateSafeMeshAsset({
      ...validAsset,
      meshes: [{ ...validAsset.meshes[0], positions: [0, 1, 2, 3] }],
    })).toThrow(/XYZ triplets/);
  });

  it("rejects material groups that escape the mesh", () => {
    expect(() => validateSafeMeshAsset({
      ...validAsset,
      meshes: [{ ...validAsset.meshes[0], groups: [{ start: 2, count: 3, materialIndex: 0 }] }],
    })).toThrow(/exceeds the mesh element count/);
  });

  it("rejects indices that reference missing vertices", () => {
    expect(() => validateSafeMeshAsset({
      ...validAsset,
      meshes: [{ ...validAsset.meshes[0], indices: [0, 1, 99] }],
    })).toThrow(/missing vertex/);
  });
});
