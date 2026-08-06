import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = path.join(root, ".asset-cache", "polyhaven");
const outputRoot = path.join(root, "public", "models", "optimized", "polyhaven");
const gltfpack = path.join(root, "node_modules", "gltfpack", "cli.js");
const userAgent = "PersistentStoryWorld3D/0.1 (Garena AI Build Challenge)";

const reviewedAssets = {
  fern_02: {
    author: "Rob Tuytel and Rico Cilliers",
    sourceUrl: "https://polyhaven.com/a/fern_02",
    lods: [
      { level: 0, ratio: 1, error: 0.005 },
      { level: 1, ratio: 0.55, error: 0.015 },
      { level: 2, ratio: 0.25, error: 0.035 },
    ],
  },
  rock_face_01: {
    author: "Dario Barresi",
    sourceUrl: "https://polyhaven.com/a/rock_face_01",
    lods: [
      { level: 0, ratio: 1, error: 0.005 },
      { level: 1, ratio: 0.5, error: 0.012 },
      { level: 2, ratio: 0.2, error: 0.03 },
    ],
  },
  street_lamp_01: {
    author: "Josh Dean",
    sourceUrl: "https://polyhaven.com/a/street_lamp_01",
    lods: [
      { level: 0, ratio: 1, error: 0.004 },
      { level: 1, ratio: 0.55, error: 0.012 },
      { level: 2, ratio: 0.25, error: 0.03 },
    ],
  },
  modular_industrial_pipes_01: {
    author: "Jorge Camacho",
    sourceUrl: "https://polyhaven.com/a/modular_industrial_pipes_01",
    lods: [
      { level: 0, ratio: 1, error: 0.004 },
      { level: 1, ratio: 0.55, error: 0.012 },
      { level: 2, ratio: 0.25, error: 0.03 },
    ],
  },
  GothicCabinet_01: {
    author: "Kirill Sannikov",
    sourceUrl: "https://polyhaven.com/a/GothicCabinet_01",
    lods: [
      { level: 0, ratio: 1, error: 0.004 },
      { level: 1, ratio: 0.55, error: 0.012 },
      { level: 2, ratio: 0.25, error: 0.03 },
    ],
  },
  ClassicConsole_01: {
    author: "Kirill Sannikov",
    sourceUrl: "https://polyhaven.com/a/ClassicConsole_01",
    lods: [
      { level: 0, ratio: 1, error: 0.004 },
      { level: 1, ratio: 0.55, error: 0.012 },
      { level: 2, ratio: 0.25, error: 0.03 },
    ],
  },
  ArmChair_01: {
    author: "Kirill Sannikov",
    sourceUrl: "https://polyhaven.com/a/ArmChair_01",
    lods: [
      { level: 0, ratio: 1, error: 0.004 },
      { level: 1, ratio: 0.55, error: 0.012 },
      { level: 2, ratio: 0.25, error: 0.03 },
    ],
  },
  lantern_chandelier_01: {
    author: "Kirill Sannikov",
    sourceUrl: "https://polyhaven.com/a/lantern_chandelier_01",
    lods: [
      { level: 0, ratio: 1, error: 0.004 },
      { level: 1, ratio: 0.55, error: 0.012 },
      { level: 2, ratio: 0.25, error: 0.03 },
    ],
  },
  painted_wooden_cabinet_02: {
    author: "Kirill Sannikov",
    sourceUrl: "https://polyhaven.com/a/painted_wooden_cabinet_02",
    lods: [
      { level: 0, ratio: 1, error: 0.004 },
      { level: 1, ratio: 0.55, error: 0.012 },
      { level: 2, ratio: 0.25, error: 0.03 },
    ],
  },
  wooden_bookshelf_worn: {
    author: "Ulan Cabanilla",
    sourceUrl: "https://polyhaven.com/a/wooden_bookshelf_worn",
    lods: [
      { level: 0, ratio: 1, error: 0.004 },
      { level: 1, ratio: 0.55, error: 0.012 },
      { level: 2, ratio: 0.25, error: 0.03 },
    ],
  },
  sofa_03: {
    author: "Fran Calvente",
    sourceUrl: "https://polyhaven.com/a/sofa_03",
    lods: [
      { level: 0, ratio: 1, error: 0.004 },
      { level: 1, ratio: 0.55, error: 0.012 },
      { level: 2, ratio: 0.25, error: 0.03 },
    ],
  },
  mantel_clock_01: {
    author: "Rico Cilliers and Yann Kervran",
    sourceUrl: "https://polyhaven.com/a/mantel_clock_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.5, error: 0.01 },
      { level: 2, ratio: 0.2, error: 0.025 },
    ],
  },
  antique_ceramic_vase_01: {
    author: "James Ray Cock",
    sourceUrl: "https://polyhaven.com/a/antique_ceramic_vase_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  chinese_tea_table: {
    author: "Kirill Sannikov",
    sourceUrl: "https://polyhaven.com/a/chinese_tea_table",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  potted_plant_01: {
    author: "Rico Cilliers",
    sourceUrl: "https://polyhaven.com/a/potted_plant_01",
    lods: [
      { level: 0, ratio: 0.42, error: 0.003 },
      { level: 1, ratio: 0.2, error: 0.012 },
      { level: 2, ratio: 0.08, error: 0.03 },
    ],
  },
  side_table_tall_01: {
    author: "James Ray Cock",
    sourceUrl: "https://polyhaven.com/a/side_table_tall_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  brass_candleholders: {
    author: "Tina",
    sourceUrl: "https://polyhaven.com/a/brass_candleholders",
    lods: [
      { level: 0, ratio: 0.8, error: 0.003 },
      { level: 1, ratio: 0.4, error: 0.012 },
      { level: 2, ratio: 0.18, error: 0.03 },
    ],
  },
  potted_plant_04: {
    author: "James Ray Cock",
    sourceUrl: "https://polyhaven.com/a/potted_plant_04",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  ornate_mirror_01: {
    author: "James Ray Cock",
    sourceUrl: "https://polyhaven.com/a/ornate_mirror_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  vintage_wooden_drawer_01: {
    author: "James Ray Cock",
    sourceUrl: "https://polyhaven.com/a/vintage_wooden_drawer_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  vintage_cabinet_01: {
    author: "Rico Cilliers",
    sourceUrl: "https://polyhaven.com/a/vintage_cabinet_01",
    lods: [
      { level: 0, ratio: 0.65, error: 0.003 },
      { level: 1, ratio: 0.35, error: 0.012 },
      { level: 2, ratio: 0.18, error: 0.03 },
    ],
  },
  tea_set_01: {
    author: "James Ray Cock, Jurita Burger, and Rico Cilliers",
    sourceUrl: "https://polyhaven.com/a/tea_set_01",
    lods: [
      { level: 0, ratio: 0.8, error: 0.003 },
      { level: 1, ratio: 0.4, error: 0.012 },
      { level: 2, ratio: 0.18, error: 0.03 },
    ],
  },
  chinese_console_table: {
    author: "Kirill Sannikov",
    sourceUrl: "https://polyhaven.com/a/chinese_console_table",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  Sofa_01: {
    author: "Kirill Sannikov",
    sourceUrl: "https://polyhaven.com/a/Sofa_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  Ottoman_01: {
    author: "Caspian Fortune",
    sourceUrl: "https://polyhaven.com/a/Ottoman_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  gothic_coffee_table: {
    author: "Ulan Cabanilla",
    sourceUrl: "https://polyhaven.com/a/gothic_coffee_table",
    lods: [
      { level: 0, ratio: 0.8, error: 0.003 },
      { level: 1, ratio: 0.4, error: 0.012 },
      { level: 2, ratio: 0.18, error: 0.03 },
    ],
  },
  gallinera_table: {
    author: "Ulan Cabanilla",
    sourceUrl: "https://polyhaven.com/a/gallinera_table",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  Chandelier_03: {
    author: "Kirill Sannikov",
    sourceUrl: "https://polyhaven.com/a/Chandelier_03",
    lods: [
      { level: 0, ratio: 0.8, error: 0.003 },
      { level: 1, ratio: 0.4, error: 0.012 },
      { level: 2, ratio: 0.18, error: 0.03 },
    ],
  },
  book_encyclopedia_set_01: {
    author: "John Malcolm",
    sourceUrl: "https://polyhaven.com/a/book_encyclopedia_set_01",
    lods: [
      { level: 0, ratio: 0.5, error: 0.003 },
      { level: 1, ratio: 0.25, error: 0.012 },
      { level: 2, ratio: 0.1, error: 0.03 },
    ],
  },
  vintage_oil_lamp: {
    author: "Monsta3D",
    sourceUrl: "https://polyhaven.com/a/vintage_oil_lamp",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  fancy_picture_frame_01: {
    author: "Rico Cilliers and Rob Tuytel",
    sourceUrl: "https://polyhaven.com/a/fancy_picture_frame_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.65, error: 0.01 },
      { level: 2, ratio: 0.35, error: 0.025 },
    ],
  },
  vintage_grandfather_clock_01: {
    author: "James Ray Cock and Yann Kervran",
    sourceUrl: "https://polyhaven.com/a/vintage_grandfather_clock_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  binder_notebook: {
    author: "DaDrood",
    sourceUrl: "https://polyhaven.com/a/binder_notebook",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.55, error: 0.012 },
      { level: 2, ratio: 0.25, error: 0.03 },
    ],
  },
  wooden_candlestick: {
    author: "Josh Dean",
    sourceUrl: "https://polyhaven.com/a/wooden_candlestick",
    lods: [
      { level: 0, ratio: 0.7, error: 0.003 },
      { level: 1, ratio: 0.35, error: 0.012 },
      { level: 2, ratio: 0.16, error: 0.03 },
    ],
  },
  fancy_picture_frame_02: {
    author: "Rico Cilliers and Rob Tuytel",
    sourceUrl: "https://polyhaven.com/a/fancy_picture_frame_02",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.65, error: 0.01 },
      { level: 2, ratio: 0.35, error: 0.025 },
    ],
  },
  jug_01: {
    author: "Kuutti Siitonen",
    sourceUrl: "https://polyhaven.com/a/jug_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  chess_set: {
    author: "Riley Queen",
    sourceUrl: "https://polyhaven.com/a/chess_set",
    lods: [
      { level: 0, ratio: 0.65, error: 0.003 },
      { level: 1, ratio: 0.3, error: 0.012 },
      { level: 2, ratio: 0.12, error: 0.03 },
    ],
  },
  horse_statue_01: {
    author: "Rico Cilliers",
    sourceUrl: "https://polyhaven.com/a/horse_statue_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  wicker_basket_02: {
    author: "Kuutti Siitonen",
    sourceUrl: "https://polyhaven.com/a/wicker_basket_02",
    lods: [
      { level: 0, ratio: 0.75, error: 0.003 },
      { level: 1, ratio: 0.38, error: 0.012 },
      { level: 2, ratio: 0.18, error: 0.03 },
    ],
  },
  brass_vase_02: {
    author: "Rico Cilliers",
    sourceUrl: "https://polyhaven.com/a/brass_vase_02",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
  Rockingchair_01: {
    author: "Jorge Camacho",
    sourceUrl: "https://polyhaven.com/a/Rockingchair_01",
    lods: [
      { level: 0, ratio: 1, error: 0.003 },
      { level: 1, ratio: 0.6, error: 0.01 },
      { level: 2, ratio: 0.3, error: 0.025 },
    ],
  },
};

const requested = process.argv.slice(2);
const slugs = requested.length ? requested : Object.keys(reviewedAssets);

function reviewed(slug) {
  const asset = reviewedAssets[slug];
  if (!asset) throw new Error(`'${slug}' is not in the reviewed CC0 optimization allowlist.`);
  return asset;
}

function safeDestination(parent, relativePath) {
  const destination = path.resolve(parent, relativePath);
  const resolvedParent = path.resolve(parent);
  if (destination !== resolvedParent && !destination.startsWith(`${resolvedParent}${path.sep}`)) {
    throw new Error(`Asset dependency escapes its directory: ${relativePath}`);
  }
  return destination;
}

async function polyhavenJson(endpoint, cacheFile) {
  try {
    return JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {
    // The source manifest is cached after the first approved download.
  }
  const response = await fetch(`https://api.polyhaven.com${endpoint}`, {
    headers: { "User-Agent": userAgent },
  });
  if (!response.ok) throw new Error(`Poly Haven API failed (${response.status}): ${endpoint}`);
  const value = await response.json();
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return value;
}

async function download(entry, destination) {
  const url = new URL(entry.url);
  if (url.protocol !== "https:" || url.hostname !== "dl.polyhaven.org") {
    throw new Error(`Unexpected Poly Haven download host: ${entry.url}`);
  }
  try {
    const existing = await readFile(destination);
    if (createHash("md5").update(existing).digest("hex") === entry.md5) return existing.length;
  } catch {
    // Cache miss; fetch the reviewed dependency below.
  }
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${entry.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("md5").update(bytes).digest("hex");
  if (entry.md5 && digest !== entry.md5) throw new Error(`Checksum mismatch for ${entry.url}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return bytes.length;
}

function runGltfpack(input, output, lod) {
  const args = [
    gltfpack,
    "-i", input,
    "-o", output,
    "-si", String(lod.ratio),
    "-se", String(lod.error),
    "-noq",
    "-kn",
    "-km",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", async (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      if (process.platform === "win32" && code === 3221226505) {
        try {
          const bytes = await readFile(output);
          if (bytes.length > 20 && bytes.subarray(0, 4).toString("ascii") === "glTF") {
            console.warn(`gltfpack emitted a Windows libuv shutdown assertion after writing valid output: ${output}`);
            resolve();
            return;
          }
        } catch {
          // Missing output remains a hard failure below.
        }
      }
      reject(new Error(`gltfpack exited with code ${code}.`));
    });
  });
}

const manifest = {
  schemaVersion: "1.0",
  generatedBy: "scripts/prepare-polyhaven-lods.mjs",
  license: "CC0 1.0 Universal",
  apiCredit: "Source assets downloaded from Poly Haven using its public API.",
  texturePolicy: "Original 1K PBR textures are preserved; geometric LODs are selected before loading.",
  assets: [],
};

if (requested.length) {
  try {
    const existingManifest = JSON.parse(await readFile(
      path.join(outputRoot, "optimization-manifest.json"),
      "utf8",
    ));
    manifest.assets.push(
      ...(existingManifest.assets ?? []).filter((asset) => !slugs.includes(asset.slug)),
    );
  } catch {
    // A first targeted import has no previous manifest to preserve.
  }
}

for (const slug of slugs) {
  const configuration = reviewed(slug);
  const sourceDirectory = path.join(cacheRoot, slug);
  const outputDirectory = path.join(outputRoot, slug);
  const sourceFile = path.join(sourceDirectory, `${slug}_1k.gltf`);
  const files = await polyhavenJson(`/files/${slug}`, path.join(sourceDirectory, "source-manifest.json"));
  const source = files?.gltf?.["1k"]?.gltf;
  if (!source?.url || !source?.md5) throw new Error(`No 1K glTF package found for '${slug}'.`);

  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  let sourceBytes = await download(source, sourceFile);
  for (const [relativePath, dependency] of Object.entries(source.include ?? {})) {
    sourceBytes += await download(dependency, safeDestination(sourceDirectory, relativePath));
  }

  const outputs = [];
  for (const lod of configuration.lods) {
    const fileName = `${slug}_lod${lod.level}.glb`;
    const output = path.join(outputDirectory, fileName);
    await runGltfpack(sourceFile, output, lod);
    const bytes = (await stat(output)).size;
    outputs.push({
      level: lod.level,
      ratio: lod.ratio,
      maximumGeometricError: lod.error,
      url: `/models/optimized/polyhaven/${slug}/${fileName}`,
      bytes,
      sha256: createHash("sha256").update(await readFile(output)).digest("hex"),
    });
  }

  manifest.assets.push({
    slug,
    author: configuration.author,
    sourceUrl: configuration.sourceUrl,
    sourceResolution: "1k",
    sourceBytes,
    lods: outputs,
  });
  console.log(`Prepared ${slug}: ${outputs.map((item) => `LOD${item.level} ${item.bytes} B`).join(", ")}`);
}

await mkdir(outputRoot, { recursive: true });
await writeFile(
  path.join(outputRoot, "optimization-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
