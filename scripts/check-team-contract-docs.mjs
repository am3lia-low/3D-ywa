import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guidePath = path.join(root, "docs", "team-integration-contract.md");
const templatePath = path.join(root, "fixtures", "part1_story_package_template.json");
const guide = await readFile(guidePath, "utf8");

const requiredSections = [
  "## Ownership matrix",
  "## Member 1 output",
  "## Member 2 input and output",
  "## Member 3 input and output",
  "## Failure and recovery",
  "## Acceptance commands",
];
for (const section of requiredSections) {
  if (!guide.includes(section)) throw new Error(`Missing documentation section: ${section}`);
}

const jsonBlocks = [...guide.matchAll(/```json\r?\n([\s\S]*?)```/g)];
if (jsonBlocks.length !== 2) {
  throw new Error(`Expected 2 JSON examples in the team contract, found ${jsonBlocks.length}.`);
}
for (const [index, match] of jsonBlocks.entries()) {
  try {
    JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Team contract JSON example ${index + 1} is invalid: ${error.message}`);
  }
}

JSON.parse(await readFile(templatePath, "utf8"));

const referencedFiles = [
  "src/index.ts",
  "src/contracts/world.ts",
  "src/contracts/visualScenePlan.ts",
  "src/contracts/validation.ts",
  "src/integration/storyPackage.ts",
  "src/integration/part1Adapter.ts",
  "src/integration/Member3ConsumerHarness.tsx",
  "src/integration/publicApi.test.tsx",
  "fixtures/story_package_import_demo.json",
  "fixtures/snapshot_1.json",
  "fixtures/patch_2.json",
  "fixtures/patch_3.json",
  "fixtures/visual_scene_plan_1.json",
  "fixtures/visual_scene_plan_3.json",
];
await Promise.all(referencedFiles.map((relativePath) => access(path.join(root, relativePath))));

console.log(
  `Team contract documentation passed: ${jsonBlocks.length} JSON examples, `
  + `${requiredSections.length} required sections, ${referencedFiles.length} source references.`,
);
