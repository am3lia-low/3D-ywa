import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { measureSafeMeshSupportSurfaceY } from "./lib/safe-mesh-support.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "src", "data", "asset-kit-catalog.json");
const outputPath = path.join(root, "src", "data", "safe-mesh-support.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const assets = {};

for (const asset of catalog.assets) {
  const url = asset.runtimeAsset?.safeMeshUrl;
  if (!url) continue;
  const relative = url.replace(/^[/\\]+/, "");
  const file = path.resolve(root, "public", relative);
  const withinPublic = file.startsWith(`${path.resolve(root, "public")}${path.sep}`);
  if (!withinPublic) throw new Error(`Safe mesh URL escapes public/: ${url}`);
  const document = JSON.parse(await readFile(file, "utf8"));
  const supportSurfaceY = measureSafeMeshSupportSurfaceY(document);
  if (supportSurfaceY !== null) {
    assets[url] = { supportSurfaceY: Number(supportSurfaceY.toFixed(6)) };
  }
}

const serialized = `${JSON.stringify({ schemaVersion: "1.0", assets }, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== serialized) {
    throw new Error("Safe-mesh support metadata is stale. Run pnpm assets:support:generate.");
  }
  console.log(`Safe-mesh support metadata is current (${Object.keys(assets).length} assets).`);
} else {
  await writeFile(outputPath, serialized);
  console.log(`Wrote ${path.relative(root, outputPath)} (${Object.keys(assets).length} assets).`);
}
