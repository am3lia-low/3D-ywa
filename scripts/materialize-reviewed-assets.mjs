import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const generatedRoot = path.join(publicRoot, "generated", "promoted");
const catalogPath = path.join(root, "src", "data", "promoted-story-assets.json");
const arguments_ = process.argv.slice(2);
const dryRun = arguments_.includes("--dry-run");
const inputArgument = arguments_.find((argument) => !argument.startsWith("--"));
const inputPath = inputArgument ? path.resolve(process.cwd(), inputArgument) : undefined;

if (!inputPath) {
  throw new Error("Usage: pnpm assets:promote <reviewed-promotion-bundle.json> [--dry-run]");
}

function safePart(value) {
  const safe = String(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safe) throw new Error(`Cannot create a safe artifact name from '${value}'.`);
  return safe;
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function decodeDataUrl(value) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error("Only base64 data URLs can be materialized.");
  return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
}

function assertBundle(bundle) {
  if (bundle?.schemaVersion !== "1.0" || !Array.isArray(bundle.assets) || bundle.assets.length === 0) {
    throw new Error("Promotion bundle must be schemaVersion 1.0 with at least one reviewed asset.");
  }
  for (const item of bundle.assets) {
    if (!item?.entityId || !item?.promotionId || !item?.job || !item?.runtimeAsset) {
      throw new Error("Promotion bundle contains an incomplete asset entry.");
    }
    if (item.referenceReview?.decision !== "approved" || item.referenceReview?.reviewer !== "human") {
      throw new Error(`Asset '${item.entityId}' is missing human reference approval.`);
    }
    if (item.assetReview?.decision !== "approved" || item.assetReview?.reviewer !== "human") {
      throw new Error(`Asset '${item.entityId}' is missing human in-world approval.`);
    }
  }
}

async function sourceModelBytes(modelUrl) {
  if (!modelUrl) throw new Error("Reviewed image-to-mesh asset has no model URL.");
  if (modelUrl.startsWith("data:")) return decodeDataUrl(modelUrl).bytes;
  if (modelUrl.startsWith("/")) {
    const source = path.resolve(publicRoot, modelUrl.replace(/^[/\\]+/, ""));
    if (!inside(publicRoot, source)) throw new Error(`Model URL escapes public/: ${modelUrl}`);
    await stat(source);
    return readFile(source);
  }
  const url = new URL(modelUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported model URL protocol '${url.protocol}'.`);
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("The materializer only fetches reviewed meshes from a local provider.");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Reviewed mesh download failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

function assertArtifactSize(bytes, entityId) {
  if (bytes.length === 0) throw new Error(`Artifact '${entityId}' is empty.`);
  if (bytes.length > 64 * 1024 * 1024) throw new Error(`Artifact '${entityId}' exceeds the 64 MiB promotion limit.`);
}

function assertGlb(bytes, entityId) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`Artifact '${entityId}' is not a self-contained glTF 2.0 GLB.`);
  }
}

const bundle = JSON.parse(await readFile(inputPath, "utf8"));
assertBundle(bundle);
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
if (catalog?.schemaVersion !== "1.0" || !Array.isArray(catalog.assets)) {
  throw new Error("Promoted story asset catalog is invalid.");
}

const promotedAt = new Date().toISOString();
for (const item of bundle.assets) {
  const storyPart = safePart(bundle.storyId);
  const entityPart = safePart(item.entityId);
  const digest = createHash("sha256")
    .update(JSON.stringify({ promotionId: item.promotionId, artifactId: item.artifactId, runtimeAsset: item.runtimeAsset }))
    .digest("hex")
    .slice(0, 12);
  const directory = path.join(generatedRoot, storyPart, entityPart);
  if (!inside(generatedRoot, directory)) throw new Error("Generated artifact path escaped its root.");
  if (!dryRun) await mkdir(directory, { recursive: true });
  const runtimeAsset = { ...item.runtimeAsset };

  if (item.job.strategy === "surface_template") {
    const extension = item.reference.mimeType === "image/jpeg"
      ? ".jpg"
      : item.reference.mimeType === "image/webp"
        ? ".webp"
        : ".png";
    const bytes = Buffer.from(item.reference.base64, "base64");
    assertArtifactSize(bytes, item.entityId);
    const fileName = `${entityPart}-${digest}${extension}`;
    if (!dryRun) await writeFile(path.join(directory, fileName), bytes);
    runtimeAsset.surfaceTextureUrl = `/generated/promoted/${storyPart}/${entityPart}/${fileName}`;
    delete runtimeAsset.modelUrl;
  } else {
    const bytes = await sourceModelBytes(runtimeAsset.modelUrl);
    assertArtifactSize(bytes, item.entityId);
    assertGlb(bytes, item.entityId);
    const fileName = `${entityPart}-${digest}.glb`;
    const destination = path.join(directory, fileName);
    if (runtimeAsset.modelUrl?.startsWith("/")) {
      const source = path.resolve(publicRoot, runtimeAsset.modelUrl.replace(/^[/\\]+/, ""));
      if (!dryRun) await copyFile(source, destination);
    } else {
      if (!dryRun) await writeFile(destination, bytes);
    }
    runtimeAsset.modelUrl = `/generated/promoted/${storyPart}/${entityPart}/${fileName}`;
  }

  const entry = {
    promotionId: item.promotionId,
    storyId: bundle.storyId,
    entityId: item.entityId,
    snapshotVersion: bundle.snapshotVersion,
    planVersion: bundle.planVersion,
    ...(item.artifactId ? { artifactId: item.artifactId } : {}),
    promotedAt,
    referenceProviderId: item.reference.providerId,
    reconstructionProviderId: item.reconstructionProviderId,
    referenceReviewedAt: item.referenceReview.reviewedAt,
    assetReviewedAt: item.assetReview.reviewedAt,
    runtimeAsset,
  };
  catalog.assets = catalog.assets.filter((candidate) => candidate.promotionId !== entry.promotionId);
  catalog.assets.push(entry);
}

catalog.assets.sort((left, right) => left.promotionId.localeCompare(right.promotionId));
if (!dryRun) await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`${dryRun ? "Validated" : "Materialized"} ${bundle.assets.length} reviewed asset(s).`);
if (!dryRun) {
  console.log(`Updated ${path.relative(root, catalogPath)}.`);
  console.log("Run pnpm verify before committing the generated files.");
}
