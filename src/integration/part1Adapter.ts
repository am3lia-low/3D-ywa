import { z } from "zod";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { Conflict, ScenePatch, WorldSnapshot } from "../contracts/world";
import {
  ConflictSchema,
  validateScenePatch,
  validateWorldSnapshot,
} from "../contracts/validation";
import { applyScenePatch } from "../runtime/applyScenePatch";
import {
  runtimeStoryFromPackage,
  validateStoryPackage,
  VisualScenePlanSchema,
  type RuntimeStory,
  type StoryPackage,
} from "./storyPackage";

const responseShapeSchema = z.looseObject({
  snapshot: z.unknown(),
  patch: z.unknown().nullable().optional(),
  conflicts: z.array(z.unknown()).optional(),
  processing_summary: z
    .looseObject({
      entities_added: z.number().int().nonnegative().optional(),
      entities_moved: z.number().int().nonnegative().optional(),
      entities_updated: z.number().int().nonnegative().optional(),
    })
    .optional(),
  visualPlan: z.unknown().optional(),
  visual_plan: z.unknown().optional(),
  visual_scene_plan: z.unknown().optional(),
});

export interface Part1PassageRequest {
  storyId: string;
  passageId: string;
  text: string;
}

export interface Part1ProcessingSummary {
  entitiesAdded: number;
  entitiesMoved: number;
  entitiesUpdated: number;
}

export interface NormalizedPart1PassageResponse {
  snapshot: WorldSnapshot;
  patch?: ScenePatch;
  conflicts: Conflict[];
  visualPlan?: VisualScenePlan;
  processingSummary: Part1ProcessingSummary;
}

export interface Part1IngestResult {
  story: RuntimeStory;
  authoritativeSnapshot: WorldSnapshot;
  acceptedPatch?: ScenePatch;
  processingSummary: Part1ProcessingSummary;
}

export type Part1AdapterErrorCode =
  | "INVALID_RESPONSE"
  | "STORY_MISMATCH"
  | "PASSAGE_MISMATCH"
  | "VISUAL_PLAN_REQUIRED"
  | "PATCH_REQUIRED"
  | "PATCH_MISMATCH";

export class Part1AdapterError extends Error {
  readonly code: Part1AdapterErrorCode;

  constructor(code: Part1AdapterErrorCode, message: string) {
    super(message);
    this.name = "Part1AdapterError";
    this.code = code;
  }
}

function issueText(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "root"}: ${issue.message}`)
    .join("; ");
}

/** Accepts common camel/snake-case visual-plan extensions to the frozen response. */
export function normalizePart1PassageResponse(
  value: unknown,
): NormalizedPart1PassageResponse {
  const parsed = responseShapeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Part1AdapterError("INVALID_RESPONSE", issueText(parsed.error));
  }

  try {
    const snapshot = validateWorldSnapshot(parsed.data.snapshot);
    const patch = parsed.data.patch == null ? undefined : validateScenePatch(parsed.data.patch);
    const visualInput =
      parsed.data.visualPlan ?? parsed.data.visual_plan ?? parsed.data.visual_scene_plan;
    let visualPlan: VisualScenePlan | undefined;
    if (visualInput !== undefined) {
      const visualResult = VisualScenePlanSchema.safeParse(visualInput);
      if (!visualResult.success) {
        throw new Part1AdapterError(
          "INVALID_RESPONSE",
          `visual_plan: ${issueText(visualResult.error)}`,
        );
      }
      visualPlan = visualResult.data as VisualScenePlan;
    }
    const conflicts = parsed.data.conflicts === undefined
      ? snapshot.conflicts
      : z.array(ConflictSchema).parse(parsed.data.conflicts) as Conflict[];
    return {
      snapshot,
      patch,
      conflicts,
      visualPlan,
      processingSummary: {
        entitiesAdded: parsed.data.processing_summary?.entities_added ?? 0,
        entitiesMoved: parsed.data.processing_summary?.entities_moved ?? 0,
        entitiesUpdated: parsed.data.processing_summary?.entities_updated ?? 0,
      },
    };
  } catch (error) {
    if (error instanceof Part1AdapterError) throw error;
    throw new Part1AdapterError(
      "INVALID_RESPONSE",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function spatialSignature(snapshot: WorldSnapshot): string {
  const byId = <T extends { id: string }>(values: readonly T[]) =>
    [...values].sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify(canonicalize({
    storyId: snapshot.storyId,
    version: snapshot.version,
    locations: byId(snapshot.locations),
    entities: byId(snapshot.entities),
    relations: byId(snapshot.relations),
  }));
}

/** Stateful bridge from passage API responses to the existing RuntimeStory surface. */
export class LivePart1StorySession {
  private storyPackage?: StoryPackage;
  private authoritativeSnapshot?: WorldSnapshot;

  constructor(private readonly label?: string) {}

  get story(): RuntimeStory | undefined {
    return this.storyPackage ? runtimeStoryFromPackage(this.storyPackage) : undefined;
  }

  ingest(request: Part1PassageRequest, input: unknown): Part1IngestResult {
    const response = normalizePart1PassageResponse(input);
    if (response.snapshot.storyId !== request.storyId) {
      throw new Part1AdapterError(
        "STORY_MISMATCH",
        `Response story '${response.snapshot.storyId}' does not match '${request.storyId}'.`,
      );
    }
    if (response.snapshot.passageId !== request.passageId) {
      throw new Part1AdapterError(
        "PASSAGE_MISMATCH",
        `Response passage '${response.snapshot.passageId}' does not match '${request.passageId}'.`,
      );
    }

    if (!this.storyPackage) {
      if (!response.visualPlan) {
        throw new Part1AdapterError(
          "VISUAL_PLAN_REQUIRED",
          "The opening response must include visual_plan (or visual_scene_plan).",
        );
      }
      this.storyPackage = validateStoryPackage({
        schemaVersion: "1.0",
        packageId: `live-${request.storyId}`,
        label: this.label ?? `Live: ${request.storyId}`,
        initialSnapshot: response.snapshot,
        moments: [{
          passageId: request.passageId,
          text: request.text,
          visualPlan: response.visualPlan,
        }],
      });
      this.authoritativeSnapshot = response.snapshot;
    } else {
      const previous = this.authoritativeSnapshot!;
      if (previous.storyId !== request.storyId) {
        throw new Part1AdapterError(
          "STORY_MISMATCH",
          `The live session belongs to '${previous.storyId}', not '${request.storyId}'.`,
        );
      }
      if (!response.patch) {
        throw new Part1AdapterError(
          "PATCH_REQUIRED",
          `World v${previous.version} requires a patch before v${response.snapshot.version}.`,
        );
      }
      let patched: WorldSnapshot;
      try {
        patched = validateWorldSnapshot(applyScenePatch(previous, response.patch));
      } catch (error) {
        throw new Part1AdapterError(
          "PATCH_MISMATCH",
          error instanceof Error ? error.message : String(error),
        );
      }
      if (spatialSignature(patched) !== spatialSignature(response.snapshot)) {
        throw new Part1AdapterError(
          "PATCH_MISMATCH",
          `Patch ${response.patch.fromVersion}→${response.patch.toVersion} does not reproduce the supplied snapshot. Request a full resynchronization.`,
        );
      }

      this.storyPackage = validateStoryPackage({
        ...this.storyPackage,
        moments: [
          ...this.storyPackage.moments,
          {
            passageId: request.passageId,
            text: request.text,
            patchFromPrevious: response.patch,
            visualPlan: response.visualPlan,
            actionLabel: `Apply ${request.passageId}`,
          },
        ],
      });
      this.authoritativeSnapshot = response.snapshot;
    }

    return {
      story: runtimeStoryFromPackage(this.storyPackage),
      authoritativeSnapshot: response.snapshot,
      acceptedPatch: response.patch,
      processingSummary: response.processingSummary,
    };
  }
}

export async function postPart1Passage(
  baseUrl: string,
  request: Part1PassageRequest,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/stories/${encodeURIComponent(request.storyId)}/passages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passage_id: request.passageId, text: request.text }),
      signal,
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Part1AdapterError(
      "INVALID_RESPONSE",
      `Part 1 returned HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Part1AdapterError("INVALID_RESPONSE", "Part 1 returned non-JSON output.");
  }
}
