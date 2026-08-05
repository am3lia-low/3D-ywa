import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const assetsDirectory = fileURLToPath(new URL("../dist/assets/", import.meta.url));
const assetNames = await readdir(assetsDirectory);
const javascriptAssets = await Promise.all(
  assetNames
    .filter((name) => name.endsWith(".js"))
    .map(async (name) => ({
      name,
      bytes: (await stat(join(assetsDirectory, name))).size,
    })),
);

const chunkBudget = 500_000;
const entryBudget = 100_000;
const oversizedChunks = javascriptAssets.filter((asset) => asset.bytes > chunkBudget);
const entryChunks = javascriptAssets.filter((asset) => asset.name.startsWith("index-"));
const oversizedEntries = entryChunks.filter((asset) => asset.bytes > entryBudget);

for (const asset of [...javascriptAssets].sort((left, right) => right.bytes - left.bytes)) {
  console.log(`${asset.name.padEnd(38)} ${(asset.bytes / 1000).toFixed(1).padStart(7)} kB`);
}

if (oversizedChunks.length > 0 || oversizedEntries.length > 0) {
  const failures = [
    ...oversizedChunks.map((asset) => `${asset.name} exceeds the 500 kB chunk budget`),
    ...oversizedEntries.map((asset) => `${asset.name} exceeds the 100 kB entry budget`),
  ];
  throw new Error(`Bundle budget failed:\n${failures.join("\n")}`);
}

console.log("Bundle budget passed.");
