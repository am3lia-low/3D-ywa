import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { polyhavenExpansionCatalogEntries } from "./polyhaven-expansion-batch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "src", "data", "asset-kit-catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const newIds = new Set([
  ...polyhavenExpansionCatalogEntries.map(({ catalogId }) => catalogId),
  // Poly Haven publishes this model without a glTF package, so the reviewed
  // browser pipeline cannot ship it even though it appears in the web catalog.
  "polyhaven:decorative-book-set-01-optimized",
]);
const newKeys = new Set(polyhavenExpansionCatalogEntries.map(({ registryKey }) => registryKey));

catalog.assets = [
  ...catalog.assets.filter(
    ({ catalogId, registryKey }) => !newIds.has(catalogId) && !newKeys.has(registryKey),
  ),
  ...polyhavenExpansionCatalogEntries,
];

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Registered ${polyhavenExpansionCatalogEntries.length} reviewed Poly Haven assets.`);
