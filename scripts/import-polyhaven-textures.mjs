import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public", "textures", "polyhaven");
const approved = new Set(["grey_roof_tiles", "brick_wall_08", "damaged_plaster"]);
const slugs = process.argv.slice(2);
const requested = slugs.length ? slugs : [...approved];
const maps = [
  ["Diffuse", "diff"],
  ["nor_gl", "nor_gl"],
  ["arm", "arm"],
];
const headers = { "User-Agent": "PersistentStoryWorld3D/0.1 (Garena AI Build Challenge)" };

for (const slug of requested) {
  if (!approved.has(slug)) throw new Error(`Texture '${slug}' is not approved.`);
  const response = await fetch(`https://api.polyhaven.com/files/${slug}`, { headers });
  if (!response.ok) throw new Error(`Manifest failed for '${slug}' (${response.status}).`);
  const manifest = await response.json();
  for (const [manifestKey, suffix] of maps) {
    const entry = manifest?.[manifestKey]?.["1k"]?.jpg;
    if (!entry?.url || !entry.md5) throw new Error(`Missing ${manifestKey} 1K JPG for '${slug}'.`);
    const url = new URL(entry.url);
    if (url.protocol !== "https:" || url.hostname !== "dl.polyhaven.org") {
      throw new Error(`Unexpected download host '${url.hostname}'.`);
    }
    const assetResponse = await fetch(url, { headers });
    if (!assetResponse.ok) throw new Error(`Download failed for '${slug}' ${manifestKey}.`);
    const bytes = Buffer.from(await assetResponse.arrayBuffer());
    const digest = createHash("md5").update(bytes).digest("hex");
    if (digest !== entry.md5) throw new Error(`Checksum mismatch for '${slug}' ${manifestKey}.`);
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, `${slug}_${suffix}_1k.jpg`), bytes);
    console.log(`Imported ${slug}_${suffix}_1k.jpg (${bytes.length} bytes).`);
  }
}
