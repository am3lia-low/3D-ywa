import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

class NodeFileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      })
      .catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob.arrayBuffer()
      .then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      })
      .catch((error) => this.onerror?.(error));
  }
}

globalThis.FileReader ??= NodeFileReader;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) throw new Error(`Unexpected argument '${token}'.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for '${token}'.`);
    values.set(token.slice(2), value);
    index += 1;
  }
  const input = values.get("input");
  const output = values.get("output");
  if (!input || !output) {
    throw new Error("Usage: node scripts/convert-external-glb.mjs --input source.glb --output safe.glb [--label name] [--palette preserve|storybook-outdoor|storybook-woodland] [--max-triangles 25000] [--max-output-bytes 1000000]");
  }
  return {
    input: resolve(input),
    output: resolve(output),
    label: values.get("label") ?? basename(output, extname(output)),
    palette: values.get("palette") ?? "preserve",
    maxTriangles: Number(values.get("max-triangles") ?? 25000),
    maxOutputBytes: Number(values.get("max-output-bytes") ?? 1000000),
  };
}

function triangleCount(geometry) {
  const count = geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0;
  return Math.floor(count / 3);
}

function safeMaterial(source, index, palette, objectName) {
  let color = "color" in source && source.color instanceof THREE.Color
    ? source.color.clone()
    : new THREE.Color("#75806f");
  if (palette === "storybook-outdoor") {
    const materialName = source.name.toLowerCase();
    if (/leaf|foliage|plant|grass|bush/.test(materialName)) color = new THREE.Color("#35543c");
    else if (/wood|bark|trunk|branch/.test(materialName)) color = new THREE.Color("#60442f");
    else if (/rock|stone|cliff/.test(materialName)) color = new THREE.Color("#69716b");
    else color.lerp(new THREE.Color("#657269"), 0.42);
  } else if (palette === "storybook-woodland") {
    const subject = `${objectName} ${source.name}`.toLowerCase();
    if (/mushroom/.test(subject)) {
      color = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) < 0.08
        ? new THREE.Color("#dfd0b4")
        : new THREE.Color("#a9443f");
    } else if (/grass|plant|fern|flower/.test(subject)) {
      color = new THREE.Color("#54754a");
    } else if (/pine|tree/.test(subject)) {
      color = color.g > color.r || color.b > color.r
        ? new THREE.Color("#356349")
        : new THREE.Color("#6c4b34");
    } else if (/log|stump|wood|bark/.test(subject)) {
      color = /_1\b/.test(objectName)
        ? new THREE.Color("#b8885d")
        : new THREE.Color("#744d32");
    } else {
      color.lerp(new THREE.Color("#596554"), 0.5);
    }
  }
  const material = new THREE.MeshStandardMaterial({
    name: `safe-material-${index}-${source.name || "surface"}`,
    color,
    roughness: Math.max(0.72, Number.isFinite(source.roughness) ? source.roughness : 0.9),
    metalness: 0,
    side: source.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
    vertexColors: Boolean(source.vertexColors),
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
  return material;
}

function finiteBounds(bounds) {
  return [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z]
    .every(Number.isFinite);
}

function sanitizeScene(sourceScene, label, maxTriangles, palette) {
  sourceScene.updateMatrixWorld(true);
  const safeRoot = new THREE.Group();
  safeRoot.name = `${label} safe runtime asset`;
  let meshes = 0;
  let materials = 0;
  let triangles = 0;

  sourceScene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.deleteAttribute("tangent");
    geometry.morphAttributes = {};
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    if (!geometry.boundingBox || !finiteBounds(geometry.boundingBox)) {
      geometry.dispose();
      throw new Error(`Mesh '${object.name || meshes}' has invalid bounds.`);
    }

    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const convertedMaterials = sourceMaterials.map(
      (material, index) => safeMaterial(material, materials + index, palette, object.name),
    );
    const mesh = new THREE.Mesh(
      geometry,
      Array.isArray(object.material) ? convertedMaterials : convertedMaterials[0],
    );
    mesh.name = `safe-mesh-${meshes}-${object.name || "mesh"}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    safeRoot.add(mesh);

    meshes += 1;
    materials += convertedMaterials.length;
    triangles += triangleCount(geometry);
  });

  if (meshes === 0) throw new Error("Input contains no visible mesh geometry.");
  if (triangles > maxTriangles) {
    throw new Error(`Input has ${triangles} triangles; budget is ${maxTriangles}.`);
  }

  safeRoot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(safeRoot);
  if (bounds.isEmpty() || !finiteBounds(bounds)) throw new Error("Sanitized scene has invalid bounds.");
  const center = bounds.getCenter(new THREE.Vector3());
  safeRoot.position.set(-center.x, -bounds.min.y, -center.z);
  safeRoot.userData = {
    sanitizedBy: "scripts/convert-external-glb.mjs",
    sourceLabel: label,
    policy: "geometry-only-standard-material-v1",
  };
  return { safeRoot, meshes, materials, triangles, sourceBounds: bounds.getSize(new THREE.Vector3()).toArray() };
}

function runtimeMeshDocument(safeRoot, label, sourceSha256) {
  safeRoot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(safeRoot);
  const size = bounds.getSize(new THREE.Vector3());
  const normalization = new THREE.Matrix4().makeScale(
    size.x > 0 ? 1 / size.x : 1,
    size.y > 0 ? 1 / size.y : 1,
    size.z > 0 ? 1 / size.z : 1,
  );
  const meshes = [];
  safeRoot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.applyMatrix4(normalization);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const materials = (Array.isArray(object.material) ? object.material : [object.material]).map((material) => ({
      color: `#${material.color.getHexString(THREE.SRGBColorSpace)}`,
      roughness: material.roughness,
      metalness: 0,
      doubleSided: material.side === THREE.DoubleSide,
    }));
    meshes.push({
      name: object.name,
      positions: Array.from(position.array),
      normals: normal ? Array.from(normal.array) : [],
      indices: geometry.index ? Array.from(geometry.index.array) : null,
      groups: geometry.groups.map(({ start, count, materialIndex }) => ({ start, count, materialIndex })),
      materials,
    });
    geometry.dispose();
  });
  return {
    schemaVersion: "1.0",
    label,
    sourceSha256,
    normalization: "unit-box-grounded-y",
    meshes,
  };
}

function glbJson(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) {
    throw new Error("Converter output is not a valid glTF 2.0 binary.");
  }
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").replace(/[\0\s]+$/g, ""));
}

const options = parseArguments(process.argv.slice(2));
if (extname(options.input).toLowerCase() !== ".glb" || extname(options.output).toLowerCase() !== ".glb") {
  throw new Error("The first converter milestone accepts binary .glb input and output only.");
}
if (!Number.isInteger(options.maxTriangles) || options.maxTriangles <= 0) throw new Error("max-triangles must be a positive integer.");
if (!Number.isInteger(options.maxOutputBytes) || options.maxOutputBytes <= 0) throw new Error("max-output-bytes must be a positive integer.");
if (!["preserve", "storybook-outdoor", "storybook-woodland"].includes(options.palette)) {
  throw new Error("palette must be 'preserve', 'storybook-outdoor' or 'storybook-woodland'.");
}

const sourceBuffer = await readFile(options.input);
const inputSha256 = createHash("sha256").update(sourceBuffer).digest("hex");
const loader = new GLTFLoader();
const baseUrl = pathToFileURL(`${dirname(options.input)}/`).href;
const parsed = await loader.parseAsync(
  sourceBuffer.buffer.slice(sourceBuffer.byteOffset, sourceBuffer.byteOffset + sourceBuffer.byteLength),
  baseUrl,
);
const sanitized = sanitizeScene(parsed.scene, options.label, options.maxTriangles, options.palette);
const exportScene = new THREE.Scene();
exportScene.name = `${options.label} converted scene`;
exportScene.add(sanitized.safeRoot);
const exported = await new GLTFExporter().parseAsync(exportScene, {
  binary: true,
  onlyVisible: true,
  trs: true,
});
const outputBuffer = Buffer.from(exported);
if (outputBuffer.byteLength > options.maxOutputBytes) {
  throw new Error(`Converted file is ${outputBuffer.byteLength} bytes; budget is ${options.maxOutputBytes}.`);
}
const document = glbJson(outputBuffer);
const forbiddenExtensions = new Set(["KHR_materials_unlit", "KHR_materials_transmission", "KHR_materials_volume"]);
const retainedForbidden = (document.extensionsUsed ?? []).filter((extension) => forbiddenExtensions.has(extension));
if (retainedForbidden.length) throw new Error(`Unsafe extensions survived conversion: ${retainedForbidden.join(", ")}.`);

await mkdir(dirname(options.output), { recursive: true });
await writeFile(options.output, outputBuffer);
const meshOutput = options.output.replace(/\.glb$/i, ".mesh.json");
const meshDocument = runtimeMeshDocument(sanitized.safeRoot, options.label, inputSha256);
await writeFile(meshOutput, `${JSON.stringify(meshDocument)}\n`);
const meshBuffer = await readFile(meshOutput);
const report = {
  schemaVersion: "1.0",
  input: basename(options.input),
  output: basename(options.output),
  inputSha256,
  outputSha256: createHash("sha256").update(outputBuffer).digest("hex"),
  runtimeMeshSha256: createHash("sha256").update(meshBuffer).digest("hex"),
  inputBytes: sourceBuffer.byteLength,
  outputBytes: (await stat(options.output)).size,
  runtimeMesh: basename(meshOutput),
  runtimeMeshBytes: meshBuffer.byteLength,
  meshes: sanitized.meshes,
  materials: sanitized.materials,
  triangles: sanitized.triangles,
  sourceBounds: sanitized.sourceBounds,
  extensionsUsed: document.extensionsUsed ?? [],
  policy: "geometry-only-standard-material-v1",
  palette: options.palette,
  status: "pass",
};
await writeFile(`${options.output}.report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
