import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (name) =>
  JSON.parse(await readFile(resolve(root, "fixtures", name), "utf8"));

const [opening, patch2, patch3, plan1, plan3] = await Promise.all([
  readJson("snapshot_1.json"),
  readJson("patch_2.json"),
  readJson("patch_3.json"),
  readJson("visual_scene_plan_1.json"),
  readJson("visual_scene_plan_3.json"),
]);

function applyPatch(snapshot, patch) {
  const next = structuredClone(snapshot);
  next.version = patch.toVersion;
  for (const operation of patch.operations) {
    if (operation.op === "add_entity") next.entities.push(operation.entity);
    if (operation.op === "remove_entity") {
      next.entities = next.entities.filter((entity) => entity.id !== operation.entityId);
      next.relations = next.relations.filter(
        (relation) => relation.subjectId !== operation.entityId && relation.objectId !== operation.entityId,
      );
    }
    if (operation.op === "move_entity") {
      const entity = next.entities.find((candidate) => candidate.id === operation.entityId);
      if (!entity) throw new Error(`Unknown entity '${operation.entityId}'.`);
      entity.locationId = operation.locationId ?? entity.locationId;
      entity.transform = {
        ...entity.transform,
        position: operation.position,
        rotation: operation.rotation ?? entity.transform?.rotation,
      };
    }
    if (operation.op === "update_entity") {
      const entity = next.entities.find((candidate) => candidate.id === operation.entityId);
      if (!entity) throw new Error(`Unknown entity '${operation.entityId}'.`);
      const changes = operation.changes;
      Object.assign(entity, changes);
      if (changes.transform) entity.transform = { ...entity.transform, ...changes.transform };
      if (changes.state) entity.state = { ...entity.state, ...changes.state };
    }
    if (operation.op === "add_relation") {
      next.relations = [
        ...next.relations.filter((relation) => relation.id !== operation.relation.id),
        operation.relation,
      ];
    }
    if (operation.op === "remove_relation") {
      next.relations = next.relations.filter((relation) => relation.id !== operation.relationId);
    }
  }
  return next;
}

function json(response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
}

function fixtureResponse(storyId, passageId) {
  let snapshot = structuredClone(opening);
  let patch = null;
  let visualPlan;
  let processingSummary = { entities_added: 0, entities_moved: 0, entities_updated: 0 };

  if (passageId === "P1") {
    visualPlan = structuredClone(plan1);
  } else if (passageId === "P2") {
    snapshot = applyPatch(snapshot, patch2);
    patch = patch2;
    processingSummary = { entities_added: 1, entities_moved: 1, entities_updated: 1 };
  } else if (passageId === "P3") {
    snapshot = applyPatch(applyPatch(snapshot, patch2), patch3);
    patch = patch3;
    visualPlan = structuredClone(plan3);
    processingSummary = { entities_added: 1, entities_moved: 1, entities_updated: 1 };
  } else {
    return undefined;
  }

  snapshot.storyId = storyId;
  snapshot.passageId = passageId;
  if (visualPlan) visualPlan.storyId = storyId;
  return {
    snapshot,
    patch,
    conflicts: snapshot.conflicts,
    processing_summary: processingSummary,
    ...(visualPlan ? { visual_plan: visualPlan } : {}),
  };
}

const server = createServer((request, response) => {
  if (request.method === "OPTIONS") return json(response, 204, {});
  if (request.method === "GET" && request.url === "/health") {
    return json(response, 200, { status: "ok", provider: "fixture-part1" });
  }

  const match = request.url?.match(/^\/api\/stories\/([^/]+)\/passages$/);
  if (request.method !== "POST" || !match) {
    return json(response, 404, { detail: "Not found" });
  }

  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) request.destroy();
  });
  request.on("end", () => {
    try {
      const input = JSON.parse(body);
      const result = fixtureResponse(decodeURIComponent(match[1]), input.passage_id);
      if (!result) return json(response, 422, { detail: "Mock supports P1, P2 and P3." });
      return json(response, 200, result);
    } catch (error) {
      return json(response, 400, { detail: error instanceof Error ? error.message : String(error) });
    }
  });
});

server.listen(8787, "127.0.0.1", () => {
  console.log("Mock Part 1 listening at http://127.0.0.1:8787");
});
