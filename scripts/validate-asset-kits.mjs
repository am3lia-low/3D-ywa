import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const catalogPath = path.join(root, "src", "data", "asset-kit-catalog.json");
const reportPath = path.join(root, "docs", "asset-quality-report.json");

function publicFile(url) {
  const relative = decodeURIComponent(url.split(/[?#]/, 1)[0]).replace(/^[/\\]+/, "");
  const resolved = path.resolve(publicRoot, relative);
  const withinPublic = resolved === publicRoot || resolved.startsWith(`${publicRoot}${path.sep}`);
  if (!withinPublic) throw new Error(`Asset URL escapes public/: ${url}`);
  return resolved;
}

function dependencyFile(modelFile, uri) {
  if (/^(?:data:|https?:)/i.test(uri)) return null;
  const resolved = path.resolve(path.dirname(modelFile), decodeURIComponent(uri));
  const withinPublic = resolved === publicRoot || resolved.startsWith(`${publicRoot}${path.sep}`);
  if (!withinPublic) throw new Error(`Model dependency escapes public/: ${uri}`);
  return resolved;
}

function parseGlb(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) {
    throw new Error("Invalid GLB header.");
  }
  if (buffer.readUInt32LE(4) !== 2) throw new Error("Only glTF 2.0 GLB files are supported.");
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error("GLB declared length does not match file length.");
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error("GLB is missing its JSON chunk.");
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").replace(/[\0\s]+$/g, ""));
}

function primitiveTriangles(primitive, accessors) {
  const count = primitive.indices === undefined
    ? accessors[primitive.attributes?.POSITION]?.count ?? 0
    : accessors[primitive.indices]?.count ?? 0;
  const mode = primitive.mode ?? 4;
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0;
}

function inspectDocument(document) {
  if (document.asset?.version !== "2.0") throw new Error("Model does not declare glTF 2.0.");
  const accessors = document.accessors ?? [];
  const primitives = (document.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  if (primitives.length === 0) throw new Error("Model has no mesh primitives.");
  const triangles = primitives.reduce((sum, primitive) => sum + primitiveTriangles(primitive, accessors), 0);
  const positionBounds = primitives
    .map((primitive) => accessors[primitive.attributes?.POSITION])
    .filter((accessor) => accessor?.min?.length === 3 && accessor?.max?.length === 3);
  let sourceBounds = null;
  if (positionBounds.length > 0) {
    const min = [0, 1, 2].map((axis) => Math.min(...positionBounds.map((item) => item.min[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...positionBounds.map((item) => item.max[axis])));
    sourceBounds = max.map((value, axis) => value - min[axis]);
  }
  return {
    triangles,
    sourceBounds,
    materialCount: (document.materials ?? []).length,
    primitives,
  };
}

function pbrProblems(document, primitives) {
  const problems = [];
  for (const [index, primitive] of primitives.entries()) {
    const material = document.materials?.[primitive.material];
    const pbr = material?.pbrMetallicRoughness;
    if (!material) problems.push(`Primitive ${index} has no material.`);
    if (!pbr?.baseColorTexture) problems.push(`Primitive ${index} has no base-color texture.`);
    if (!pbr?.metallicRoughnessTexture) problems.push(`Primitive ${index} has no metallic/roughness texture.`);
    if (!material?.normalTexture) problems.push(`Primitive ${index} has no normal texture.`);
  }
  return problems;
}

async function inspectModel(modelUrl) {
  const modelFile = publicFile(modelUrl);
  const buffer = await readFile(modelFile);
  const document = path.extname(modelFile).toLowerCase() === ".glb"
    ? parseGlb(buffer)
    : JSON.parse(buffer.toString("utf8"));
  const inspected = inspectDocument(document);
  const dependencies = [
    ...(document.buffers ?? []).map((item) => item.uri).filter(Boolean),
    ...(document.images ?? []).map((item) => item.uri).filter(Boolean),
  ];
  const files = new Set([modelFile]);
  for (const uri of dependencies) {
    const dependency = dependencyFile(modelFile, uri);
    if (dependency) {
      await stat(dependency);
      files.add(dependency);
    }
  }
  return { document, files, ...inspected };
}

async function inspectSafeMesh(safeMeshUrl) {
  const safeMeshFile = publicFile(safeMeshUrl);
  const document = JSON.parse(await readFile(safeMeshFile, "utf8"));
  if (document.schemaVersion !== "1.0" || document.normalization !== "unit-box-grounded-y") {
    throw new Error("Unsupported safe mesh schema or normalization.");
  }
  if (!Array.isArray(document.meshes) || document.meshes.length === 0) {
    throw new Error("Safe mesh contains no geometry.");
  }
  let triangles = 0;
  let materialCount = 0;
  const positions = [];
  for (const [meshIndex, mesh] of document.meshes.entries()) {
    if (!Array.isArray(mesh.positions) || mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) {
      throw new Error(`Safe mesh ${meshIndex} has malformed positions.`);
    }
    if (!mesh.positions.every(Number.isFinite)) throw new Error(`Safe mesh ${meshIndex} has non-finite positions.`);
    const vertexCount = mesh.positions.length / 3;
    const elements = mesh.indices ?? Array.from({ length: vertexCount }, (_, index) => index);
    if (!elements.every((index) => Number.isInteger(index) && index >= 0 && index < vertexCount)) {
      throw new Error(`Safe mesh ${meshIndex} has an invalid index.`);
    }
    triangles += Math.floor(elements.length / 3);
    materialCount += mesh.materials?.length ?? 0;
    positions.push(...mesh.positions);
  }
  const sourceBounds = [0, 1, 2].map((axis) => {
    const values = [];
    for (let index = axis; index < positions.length; index += 3) values.push(positions[index]);
    return Math.max(...values) - Math.min(...values);
  });
  return { files: new Set([safeMeshFile]), triangles, materialCount, sourceBounds };
}

async function totalBytes(files) {
  let bytes = 0;
  for (const file of files) bytes += (await stat(file)).size;
  return bytes;
}

function distortion(runtimeDimensions, sourceBounds) {
  if (!sourceBounds?.every((value) => Number.isFinite(value) && value > 0)) return null;
  const scales = runtimeDimensions.map((value, axis) => value / sourceBounds[axis]);
  return Math.max(...scales) / Math.min(...scales);
}

async function inspectAsset(asset) {
  const errors = [];
  const warnings = [];
  const lods = [];
  const surfaceOnly = asset.runtimeAsset.surfaceTextureUrl
    && !asset.runtimeAsset.modelUrl
    && !asset.runtimeAsset.safeMeshUrl;
  let triangles = surfaceOnly ? 2 : 0;
  let materialCount = surfaceOnly ? 1 : 0;
  let sourceBounds = null;
  let aspectDistortion = null;
  const files = new Set();
  try {
    let model;
    if (asset.runtimeAsset.modelUrl) {
      model = await inspectModel(asset.runtimeAsset.modelUrl);
      model.files.forEach((file) => files.add(file));
      triangles = model.triangles;
      materialCount = model.materialCount;
      sourceBounds = model.sourceBounds;
      aspectDistortion = distortion(asset.runtimeAsset.dimensions, sourceBounds);
      if (asset.qualityGate.requirePbrTextures) errors.push(...pbrProblems(model.document, model.primitives));
      if (!sourceBounds) errors.push("Model POSITION accessors do not declare source bounds.");
    } else if (asset.runtimeAsset.safeMeshUrl) {
      const safeMesh = await inspectSafeMesh(asset.runtimeAsset.safeMeshUrl);
      safeMesh.files.forEach((file) => files.add(file));
      triangles = safeMesh.triangles;
      materialCount = safeMesh.materialCount;
      sourceBounds = safeMesh.sourceBounds;
      aspectDistortion = distortion(asset.runtimeAsset.dimensions, sourceBounds);
    }
    if (asset.runtimeAsset.surfaceTextureUrl) {
      const texture = publicFile(asset.runtimeAsset.surfaceTextureUrl);
      await stat(texture);
      files.add(texture);
    }
    if (asset.runtimeAsset.lods) {
      let previousTriangles = Number.POSITIVE_INFINITY;
      for (const [index, lod] of asset.runtimeAsset.lods.entries()) {
        const inspected = await inspectModel(lod.modelUrl);
        const bytes = await totalBytes(inspected.files);
        const lodDistortion = distortion(asset.runtimeAsset.dimensions, inspected.sourceBounds);
        const prefix = `LOD${index}`;
        if (asset.qualityGate.requirePbrTextures) {
          errors.push(...pbrProblems(inspected.document, inspected.primitives).map((problem) => `${prefix}: ${problem}`));
        }
        if (bytes > asset.qualityGate.maxTotalBytes) {
          errors.push(`${prefix} bundle is ${bytes} bytes; budget is ${asset.qualityGate.maxTotalBytes}.`);
        }
        if (inspected.triangles > asset.qualityGate.maxTriangles) {
          errors.push(`${prefix} has ${inspected.triangles} triangles; budget is ${asset.qualityGate.maxTriangles}.`);
        }
        if (index > 0 && inspected.triangles >= previousTriangles) {
          errors.push(`${prefix} must contain fewer triangles than the previous level.`);
        }
        if (lodDistortion !== null && lodDistortion > asset.qualityGate.maxAspectDistortion) {
          errors.push(`${prefix} normalization distortion is ${lodDistortion.toFixed(2)}x; limit is ${asset.qualityGate.maxAspectDistortion}x.`);
        }
        previousTriangles = inspected.triangles;
        lods.push({
          level: index,
          minimumDistance: lod.minimumDistance,
          modelUrl: lod.modelUrl,
          totalBytes: bytes,
          triangles: inspected.triangles,
          sourceBounds: inspected.sourceBounds?.map((value) => Number(value.toFixed(4))) ?? null,
        });
      }
    }
    const bytes = await totalBytes(files);
    if (bytes > asset.qualityGate.maxTotalBytes) {
      errors.push(`Bundle is ${bytes} bytes; budget is ${asset.qualityGate.maxTotalBytes}.`);
    }
    if (triangles > asset.qualityGate.maxTriangles) {
      errors.push(`Model has ${triangles} triangles; budget is ${asset.qualityGate.maxTriangles}.`);
    }
    if (aspectDistortion !== null && aspectDistortion > asset.qualityGate.maxAspectDistortion) {
      const message = `Runtime normalization distortion is ${aspectDistortion.toFixed(2)}x; limit is ${asset.qualityGate.maxAspectDistortion}x.`;
      if (asset.qualityGate.waiver) warnings.push(`${message} Waiver: ${asset.qualityGate.waiver}`);
      else errors.push(message);
    }
    return {
      catalogId: asset.catalogId,
      registryKey: asset.registryKey,
      status: errors.length ? "fail" : warnings.length ? "warning" : "pass",
      files: [...files].map((file) => path.relative(root, file).replaceAll("\\", "/")).sort(),
      totalBytes: bytes,
      triangles,
      materialCount,
      sourceBounds: sourceBounds?.map((value) => Number(value.toFixed(4))) ?? null,
      aspectDistortion: aspectDistortion === null ? null : Number(aspectDistortion.toFixed(2)),
      warnings,
      errors,
      lods,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      catalogId: asset.catalogId,
      registryKey: asset.registryKey,
      status: "fail",
      files: [...files].map((file) => path.relative(root, file).replaceAll("\\", "/")).sort(),
      totalBytes: 0,
      triangles,
      materialCount,
      sourceBounds,
      aspectDistortion,
      warnings,
      errors,
      lods,
    };
  }
}

function validateCatalog(catalog) {
  const errors = [];
  if (catalog.schemaVersion !== "1.0") errors.push("Unsupported catalog schema version.");
  const kitIds = new Set();
  const catalogIds = new Set();
  const registryKeys = new Set();
  for (const kit of catalog.kits ?? []) {
    if (kitIds.has(kit.id)) errors.push(`Duplicate kit '${kit.id}'.`);
    kitIds.add(kit.id);
  }
  for (const asset of catalog.assets ?? []) {
    if (catalogIds.has(asset.catalogId)) errors.push(`Duplicate asset '${asset.catalogId}'.`);
    if (registryKeys.has(asset.registryKey)) errors.push(`Duplicate registry key '${asset.registryKey}'.`);
    catalogIds.add(asset.catalogId);
    registryKeys.add(asset.registryKey);
    if (!asset.runtimeAsset?.modelUrl && !asset.runtimeAsset?.safeMeshUrl && !asset.runtimeAsset?.surfaceTextureUrl) {
      errors.push(`Asset '${asset.catalogId}' has neither a model, safe mesh nor a controlled surface.`);
    }
    if (asset.source === "cc0" && !asset.sourceUrl) errors.push(`CC0 asset '${asset.catalogId}' lacks provenance.`);
    if (asset.runtimeAsset?.lods) {
      if (asset.runtimeAsset.lods[0]?.modelUrl !== asset.runtimeAsset.modelUrl) {
        errors.push(`Asset '${asset.catalogId}' does not use LOD0 as its primary model.`);
      }
      if (asset.runtimeAsset.lods[0]?.minimumDistance !== 0) {
        errors.push(`Asset '${asset.catalogId}' does not start LOD0 at distance zero.`);
      }
      for (let index = 1; index < asset.runtimeAsset.lods.length; index += 1) {
        if (asset.runtimeAsset.lods[index].minimumDistance <= asset.runtimeAsset.lods[index - 1].minimumDistance) {
          errors.push(`Asset '${asset.catalogId}' has non-increasing LOD distances.`);
        }
      }
    }
    for (const kitId of asset.styleKitIds ?? []) {
      if (!kitIds.has(kitId)) errors.push(`Asset '${asset.catalogId}' references unknown kit '${kitId}'.`);
    }
  }
  const kits = (catalog.kits ?? []).map((kit) => {
    const coveredRoles = new Set(
      (catalog.assets ?? []).filter((asset) => asset.styleKitIds?.includes(kit.id)).flatMap((asset) => asset.roles ?? []),
    );
    const missingRoles = (kit.requiredRoles ?? []).filter((role) => !coveredRoles.has(role));
    if (missingRoles.length) errors.push(`Kit '${kit.id}' lacks: ${missingRoles.join(", ")}.`);
    return { id: kit.id, requiredRoles: kit.requiredRoles, missingRoles, complete: missingRoles.length === 0 };
  });
  return { errors, kits };
}

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const structural = validateCatalog(catalog);
const assets = await Promise.all((catalog.assets ?? []).map(inspectAsset));
const passed = assets.filter((asset) => asset.status === "pass").length;
const warnings = assets.filter((asset) => asset.status === "warning").length;
const failed = assets.filter((asset) => asset.status === "fail").length;
const report = {
  schemaVersion: "1.0",
  catalogSchemaVersion: catalog.schemaVersion,
  summary: {
    kits: structural.kits.length,
    completeKits: structural.kits.filter((kit) => kit.complete).length,
    assets: assets.length,
    passed,
    warnings,
    failed: failed + structural.errors.length,
  },
  catalogErrors: structural.errors,
  kits: structural.kits,
  assets,
};

if (process.argv.includes("--write")) {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

for (const asset of assets) {
  console.log(`${asset.status.padEnd(7)} ${asset.catalogId} (${asset.triangles} tris, ${asset.totalBytes} bytes)`);
  for (const warning of asset.warnings) console.log(`        warning: ${warning}`);
  for (const error of asset.errors) console.error(`        error: ${error}`);
}
for (const error of structural.errors) console.error(`catalog error: ${error}`);
console.log(`Asset kits: ${report.summary.completeKits}/${report.summary.kits} complete; assets: ${passed} pass, ${warnings} warning, ${failed} fail.`);
if (report.summary.failed > 0) process.exitCode = 1;
