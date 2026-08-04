import { z } from "zod";

const finiteNumber = z.number().finite();
const materialSchema = z.strictObject({
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1),
  doubleSided: z.boolean(),
});
const groupSchema = z.strictObject({
  start: z.number().int().nonnegative(),
  count: z.number().int().positive(),
  materialIndex: z.number().int().nonnegative(),
});
const meshSchema = z.strictObject({
  name: z.string().min(1),
  positions: z.array(finiteNumber).min(9),
  normals: z.array(finiteNumber),
  indices: z.array(z.number().int().nonnegative()).nullable(),
  groups: z.array(groupSchema),
  materials: z.array(materialSchema).min(1).max(16),
});

export const SafeMeshAssetSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  label: z.string().min(1),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  normalization: z.literal("unit-box-grounded-y"),
  meshes: z.array(meshSchema).min(1).max(64),
}).superRefine((asset, context) => {
  let totalTriangles = 0;
  asset.meshes.forEach((mesh, meshIndex) => {
    if (mesh.positions.length % 3 !== 0) {
      context.addIssue({ code: "custom", path: ["meshes", meshIndex, "positions"], message: "Position data must contain XYZ triplets." });
    }
    if (mesh.normals.length !== 0 && mesh.normals.length !== mesh.positions.length) {
      context.addIssue({ code: "custom", path: ["meshes", meshIndex, "normals"], message: "Normals must match the position count." });
    }
    const vertexCount = mesh.positions.length / 3;
    if (mesh.indices?.some((index) => index >= vertexCount)) {
      context.addIssue({ code: "custom", path: ["meshes", meshIndex, "indices"], message: "Index references a missing vertex." });
    }
    const elementCount = mesh.indices?.length ?? mesh.positions.length / 3;
    totalTriangles += Math.floor(elementCount / 3);
    mesh.groups.forEach((group, groupIndex) => {
      if (group.materialIndex >= mesh.materials.length) {
        context.addIssue({ code: "custom", path: ["meshes", meshIndex, "groups", groupIndex, "materialIndex"], message: "Group references a missing material." });
      }
      if (group.start + group.count > elementCount) {
        context.addIssue({ code: "custom", path: ["meshes", meshIndex, "groups", groupIndex], message: "Group exceeds the mesh element count." });
      }
    });
  });
  if (totalTriangles > 25000) {
    context.addIssue({ code: "custom", path: ["meshes"], message: `Safe mesh has ${totalTriangles} triangles; runtime budget is 25000.` });
  }
});

export type SafeMeshAsset = z.infer<typeof SafeMeshAssetSchema>;

// Converted safe meshes are normalized into a unit box whose base sits at Y=0.
// Entity transforms use a center-based origin, so offset the normalized mesh by
// half its height before the entity's dimensions are applied.
export const SAFE_MESH_CENTER_OFFSET = [0, -0.5, 0] as const;

export function validateSafeMeshAsset(value: unknown): SafeMeshAsset {
  return SafeMeshAssetSchema.parse(value);
}
