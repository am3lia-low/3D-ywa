import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const sourceRoots = [
  path.join(root, "src"),
  path.join(root, "Create UI Prototype for Hackathon", "src"),
];
const assetUrlPattern = /["'`](\/(?:models|textures|environments|safe-meshes)\/[^"'`\s?#]+)["'`]/g;
const textureImporter = path.join(root, "scripts", "import-polyhaven-textures.mjs");

function isTestFile(file) {
  return /(?:^|[\\/])(?:__tests__|test|tests)(?:[\\/]|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file);
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(resolved));
    else if (/\.(?:json|[cm]?[jt]sx?)$/i.test(entry.name) && !isTestFile(resolved)) files.push(resolved);
  }
  return files;
}

function publicFile(url) {
  const relative = decodeURIComponent(url).replace(/^[/\\]+/, "");
  const resolved = path.resolve(publicRoot, relative);
  if (resolved !== publicRoot && !resolved.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error(`Asset URL escapes public/: ${url}`);
  }
  return resolved;
}

function relativeToRoot(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function requireTracked(file, problems) {
  const relative = relativeToRoot(file);
  const result = spawnSync(
    "git",
    ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "ls-files", "--error-unmatch", "--", relative],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) problems.push(`${relative} exists locally but is not tracked by Git.`);
}

async function requireFile(file, problems, checked) {
  const resolved = path.resolve(file);
  if (checked.has(resolved)) return;
  checked.add(resolved);
  try {
    const metadata = await stat(resolved);
    if (!metadata.isFile() || metadata.size === 0) {
      problems.push(`${relativeToRoot(resolved)} is missing file content.`);
      return;
    }
  } catch {
    problems.push(`${relativeToRoot(resolved)} is missing.`);
    return;
  }
  requireTracked(resolved, problems);

  if (path.extname(resolved).toLowerCase() !== ".gltf") return;
  let document;
  try {
    document = JSON.parse(await readFile(resolved, "utf8"));
  } catch (error) {
    problems.push(`${relativeToRoot(resolved)} is not valid glTF JSON: ${error.message}`);
    return;
  }
  const dependencies = [
    ...(document.buffers ?? []).map((item) => item.uri),
    ...(document.images ?? []).map((item) => item.uri),
  ].filter((uri) => uri && !/^(?:data:|https?:)/i.test(uri));
  for (const uri of dependencies) {
    const dependency = path.resolve(path.dirname(resolved), decodeURIComponent(uri));
    if (dependency !== publicRoot && !dependency.startsWith(`${publicRoot}${path.sep}`)) {
      problems.push(`${relativeToRoot(resolved)} references a dependency outside public/: ${uri}`);
      continue;
    }
    await requireFile(dependency, problems, checked);
  }
}

async function collectLiteralUrls() {
  const urls = new Set();
  for (const sourceRoot of sourceRoots) {
    for (const file of await sourceFiles(sourceRoot)) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(assetUrlPattern)) {
        if (!match[1].includes("${")) urls.add(match[1]);
      }
    }
  }
  return urls;
}

async function collectDynamicPbrUrls(urls) {
  const source = await readFile(textureImporter, "utf8");
  const approvedBlock = source.match(/const approved = new Set\(\[([\s\S]*?)\]\);/);
  if (!approvedBlock) throw new Error("Could not read the approved Poly Haven texture list.");
  for (const match of approvedBlock[1].matchAll(/["']([a-z0-9_]+)["']/gi)) {
    for (const suffix of ["diff", "nor_gl", "arm"]) {
      urls.add(`/textures/polyhaven/${match[1]}_${suffix}_1k.jpg`);
    }
  }
}

const problems = [];
const checked = new Set();
const urls = await collectLiteralUrls();
await collectDynamicPbrUrls(urls);

for (const url of [...urls].sort()) {
  await requireFile(publicFile(url), problems, checked);
}

if (problems.length > 0) {
  console.error("Runtime asset portability check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Runtime asset portability check passed: ${urls.size} URLs resolve to ${checked.size} tracked files.`);
}
