import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

class NodeFileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      })
      .catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      })
      .catch((error) => this.onerror?.(error));
  }
}

globalThis.FileReader ??= NodeFileReader;

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(rootDirectory, "public", "models");

function material(name, color, { roughness = 0.82, metalness = 0 } = {}) {
  const value = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  value.name = name;
  return value;
}

function addBox(parent, name, size, position, surface, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), surface);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, name, radius, height, position, surface, segments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, segments),
    surface,
  );
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function normalizeModel(name, content) {
  content.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(content);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  content.position.sub(center);

  const normalized = new THREE.Group();
  normalized.name = name;
  normalized.scale.set(1 / size.x, 1 / size.y, 1 / size.z);
  normalized.add(content);
  normalized.userData = {
    author: "Persistent StoryWorld 3D team",
    license: "Project-owned original asset",
  };
  return normalized;
}

function deskModel() {
  const wood = material("Dark oak", "#6f472c", { roughness: 0.88 });
  const inset = material("Drawer inset", "#3e2618", { roughness: 0.92 });
  const brass = material("Brass pulls", "#bd8738", { roughness: 0.4, metalness: 0.7 });
  const root = new THREE.Group();
  addBox(root, "Desk top", [0.94, 0.12, 0.66], [0, 0.28, 0], wood);
  for (const x of [-0.39, 0.39]) {
    for (const z of [-0.26, 0.26]) addBox(root, "Desk leg", [0.1, 0.7, 0.1], [x, -0.12, z], wood);
  }
  addBox(root, "Drawer", [0.58, 0.17, 0.08], [0, 0.15, 0.34], inset);
  for (const x of [-0.13, 0.13]) addCylinder(root, "Drawer pull", 0.025, 0.045, [x, 0.15, 0.4], brass, 8).rotateX(Math.PI / 2);
  return normalizeModel("Low-poly oak desk", root);
}

function chairModel() {
  const wood = material("Warm oak", "#8a5b38", { roughness: 0.86 });
  const root = new THREE.Group();
  addBox(root, "Seat", [0.74, 0.13, 0.72], [0, 0, 0], wood);
  for (const x of [-0.29, 0.29]) {
    for (const z of [-0.27, 0.27]) addBox(root, "Chair leg", [0.1, 0.58, 0.1], [x, -0.34, z], wood);
  }
  addBox(root, "Back rail", [0.74, 0.12, 0.1], [0, 0.69, -0.31], wood);
  for (const x of [-0.29, 0, 0.29]) addBox(root, "Back slat", [0.085, 0.68, 0.08], [x, 0.36, -0.31], wood);
  return normalizeModel("Low-poly desk chair", root);
}

function fireplaceModel() {
  const stone = material("Aged stone", "#776d65", { roughness: 1 });
  const dark = material("Sooted opening", "#181513", { roughness: 1 });
  const ember = material("Cold embers", "#5e2d1d", { roughness: 0.95 });
  const root = new THREE.Group();
  addBox(root, "Left pillar", [0.22, 0.84, 0.48], [-0.36, -0.08, 0], stone);
  addBox(root, "Right pillar", [0.22, 0.84, 0.48], [0.36, -0.08, 0], stone);
  addBox(root, "Mantel", [0.98, 0.18, 0.56], [0, 0.43, 0], stone);
  addBox(root, "Hearth", [0.92, 0.12, 0.72], [0, -0.49, 0.1], stone);
  addBox(root, "Firebox", [0.5, 0.63, 0.08], [0, -0.15, -0.2], dark);
  addBox(root, "Embers", [0.42, 0.08, 0.24], [0, -0.39, 0.02], ember);
  return normalizeModel("Low-poly stone fireplace", root);
}

function rugModel() {
  const red = material("Faded red weave", "#874b48", { roughness: 1 });
  const border = material("Rug border", "#c28b69", { roughness: 1 });
  const root = new THREE.Group();
  addBox(root, "Rug field", [1, 0.08, 1], [0, 0, 0], red);
  addBox(root, "North border", [1, 0.035, 0.075], [0, 0.06, -0.45], border);
  addBox(root, "South border", [1, 0.035, 0.075], [0, 0.06, 0.45], border);
  addBox(root, "West border", [0.075, 0.035, 0.85], [-0.46, 0.06, 0], border);
  addBox(root, "East border", [0.075, 0.035, 0.85], [0.46, 0.06, 0], border);
  return normalizeModel("Low-poly faded rug", root);
}

function lanternModel() {
  const brass = material("Aged brass", "#c98f34", { roughness: 0.38, metalness: 0.72 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: "#ffd58b",
    roughness: 0.18,
    metalness: 0,
    transparent: true,
    opacity: 0.48,
  });
  glass.name = "Amber glass";
  const root = new THREE.Group();
  addCylinder(root, "Lantern base", 0.38, 0.13, [0, -0.42, 0], brass, 12);
  addCylinder(root, "Glass chamber", 0.28, 0.58, [0, -0.07, 0], glass, 12);
  addCylinder(root, "Lantern cap", 0.34, 0.12, [0, 0.27, 0], brass, 12);
  addCylinder(root, "Vent", 0.16, 0.18, [0, 0.42, 0], brass, 10);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 6, 16, Math.PI), brass);
  handle.name = "Lantern handle";
  handle.position.set(0, 0.46, 0);
  handle.rotation.z = Math.PI;
  root.add(handle);
  return normalizeModel("Low-poly brass lantern", root);
}

function hiddenDoorModel() {
  const wood = material("Dark boards", "#4e3c31", { roughness: 0.94 });
  const brace = material("Door braces", "#2d211b", { roughness: 0.96 });
  const iron = material("Iron latch", "#4c4b49", { roughness: 0.5, metalness: 0.72 });
  const root = new THREE.Group();
  addBox(root, "Door slab", [0.9, 1, 0.16], [0, 0, 0], wood);
  for (const x of [-0.31, -0.1, 0.1, 0.31]) addBox(root, "Vertical board seam", [0.025, 0.96, 0.02], [x, 0, 0.09], brace);
  addBox(root, "Upper brace", [0.82, 0.09, 0.08], [0, 0.28, 0.13], brace, [0, 0, -0.15]);
  addBox(root, "Lower brace", [0.82, 0.09, 0.08], [0, -0.28, 0.13], brace, [0, 0, 0.15]);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), iron);
  knob.name = "Iron knob";
  knob.position.set(0.32, -0.02, 0.16);
  root.add(knob);
  return normalizeModel("Low-poly hidden door", root);
}

const models = {
  desk: deskModel,
  chair: chairModel,
  fireplace: fireplaceModel,
  rug: rugModel,
  lantern: lanternModel,
  "hidden-door": hiddenDoorModel,
};

await mkdir(outputDirectory, { recursive: true });
const exporter = new GLTFExporter();
const manifest = [];

for (const [key, createModel] of Object.entries(models)) {
  const scene = new THREE.Scene();
  scene.name = `${key} asset scene`;
  scene.add(createModel());
  const buffer = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    trs: true,
  });
  const fileName = `${key}.glb`;
  await writeFile(resolve(outputDirectory, fileName), Buffer.from(buffer));
  manifest.push({
    key,
    url: `/models/${fileName}`,
    format: "glTF 2.0 binary",
    author: "Persistent StoryWorld 3D team",
    license: "Project-owned original asset",
    bytes: buffer.byteLength,
  });
}

manifest.push(
  {
    key: "lantern-triposr",
    url: "/generated/lantern-1-4f008ea027c5.glb",
    format: "glTF 2.0 binary with vertex colors",
    author: "Persistent StoryWorld 3D team using TripoSR",
    license: "Project-owned generated artifact; TripoSR code and weights are MIT licensed",
    bytes: (await stat(resolve(rootDirectory, "public", "generated", "lantern-1-4f008ea027c5.glb"))).size,
  },
  {
    key: "desk-polyhaven",
    url: "/models/polyhaven/wooden_table_02/wooden_table_02_1k.gltf",
    format: "glTF 2.0 with 1K PBR textures",
    author: "Serhii Khromov",
    license: "CC0 1.0 Universal",
    bytes: 485316,
  },
  {
    key: "chair-polyhaven",
    url: "/models/polyhaven/WoodenChair_01/WoodenChair_01_1k.gltf",
    format: "glTF 2.0 with 1K PBR textures",
    author: "Jake Mobley",
    license: "CC0 1.0 Universal",
    bytes: 1079531,
  },
  {
    key: "crate-polyhaven",
    url: "/models/polyhaven/wooden_crate_01/wooden_crate_01_1k.gltf",
    format: "glTF 2.0 with 1K PBR textures",
    author: "James Ray Cock",
    license: "CC0 1.0 Universal",
    bytes: 2277087,
  },
);

await writeFile(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify({ generatedBy: "scripts/generate-models.mjs", assets: manifest }, null, 2)}\n`,
);

console.log(`Recorded ${manifest.length} generated and vendored assets in ${outputDirectory}.`);
