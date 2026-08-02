import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { ScenePatchSchema, WorldSnapshotSchema } from "../src/contracts/validation.ts";

const outputDirectory = resolve("contracts");
await mkdir(outputDirectory, { recursive: true });

const schemas = [
  ["world-snapshot.schema.json", "WorldSnapshot", WorldSnapshotSchema],
  ["scene-patch.schema.json", "ScenePatch", ScenePatchSchema],
];

for (const [fileName, id, schema] of schemas) {
  const jsonSchema = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    reused: "ref",
  });
  jsonSchema.$id = `https://persistent-storyworld.local/contracts/${id}`;
  jsonSchema.title = id;
  await writeFile(
    resolve(outputDirectory, fileName),
    `${JSON.stringify(jsonSchema, null, 2)}\n`,
  );
}

console.log(`Generated ${schemas.length} JSON Schemas in ${outputDirectory}.`);

