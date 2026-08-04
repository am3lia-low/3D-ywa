import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "public", "models", "polyhaven");
const resolution = "1k";
const userAgent = "PersistentStoryWorld3D/0.1 (Garena AI Build Challenge)";
const approvedSlugs = new Set([
  "large_castle_door",
  "painted_wooden_bench",
  "wine_barrel_01",
]);

const requestedSlugs = process.argv.slice(2);
const slugs = requestedSlugs.length ? requestedSlugs : [...approvedSlugs];

function safeDestination(slug, relativePath) {
  const destination = path.resolve(outputRoot, slug, relativePath);
  const assetRoot = path.resolve(outputRoot, slug);
  if (destination !== assetRoot && !destination.startsWith(`${assetRoot}${path.sep}`)) {
    throw new Error(`Poly Haven dependency escapes '${slug}': ${relativePath}`);
  }
  return destination;
}

async function download(entry, destination) {
  const url = new URL(entry.url);
  if (url.protocol !== "https:" || url.hostname !== "dl.polyhaven.org") {
    throw new Error(`Unexpected Poly Haven download host: ${entry.url}`);
  }
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${entry.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("md5").update(bytes).digest("hex");
  if (entry.md5 && digest !== entry.md5) {
    throw new Error(`Checksum mismatch for ${entry.url}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return bytes.length;
}

for (const slug of slugs) {
  if (!approvedSlugs.has(slug)) {
    throw new Error(`'${slug}' is not in the reviewed CC0 asset allowlist.`);
  }
  const response = await fetch(`https://api.polyhaven.com/files/${slug}`, {
    headers: { "User-Agent": userAgent },
  });
  if (!response.ok) throw new Error(`Could not load Poly Haven manifest for '${slug}'.`);
  const manifest = await response.json();
  const gltf = manifest?.gltf?.[resolution]?.gltf;
  if (!gltf?.url || !gltf?.md5) throw new Error(`No ${resolution} glTF found for '${slug}'.`);

  let total = 0;
  total += await download(gltf, safeDestination(slug, `${slug}_${resolution}.gltf`));
  for (const [relativePath, dependency] of Object.entries(gltf.include ?? {})) {
    total += await download(dependency, safeDestination(slug, relativePath));
  }
  console.log(`Imported ${slug} (${total} bytes).`);
}
