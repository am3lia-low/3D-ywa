import { z } from "zod";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import {
  ContractValidationError,
  validateScenePatch,
  validateWorldSnapshot,
} from "../contracts/validation";
import { applyScenePatch } from "../runtime/applyScenePatch";
import { compileSceneRecipe } from "../runtime/sceneRecipeCompiler";

const identifierSchema = z.string().trim().min(1);
const stringListSchema = z.array(z.string().trim().min(1));
const evidenceSchema = z.looseObject({
  passageIds: z.array(identifierSchema).min(1),
  confidence: z.number().min(0).max(1),
  basis: z.enum(["explicit_text", "cross_passage_inference", "art_direction_default"]),
  note: z.string().optional(),
});
const paletteSchema = z.strictObject({
  background: identifierSchema,
  fog: identifierSchema,
  floor: identifierSchema,
  wall: identifierSchema,
  timber: identifierSchema,
  ambient: identifierSchema,
  keyLight: identifierSchema,
  practical: identifierSchema,
});
const visualLocationSchema = z.looseObject({
  locationId: identifierSchema,
  archetype: identifierSchema,
  visualDescription: z.string().trim().min(1),
  architectureTags: stringListSchema,
  dressingTags: stringListSchema,
  dressingDensity: z.enum(["sparse", "moderate", "rich"]),
  mood: z.string().trim().min(1),
  timeOfDay: z.string().trim().min(1),
  palette: paletteSchema,
  lighting: z.looseObject({
    warmth: z.enum(["cool", "neutral", "warm"]),
    contrast: z.enum(["low", "medium", "high"]),
    ambientIntensity: z.number().nonnegative(),
    keyIntensity: z.number().nonnegative(),
    atmosphericEffects: stringListSchema,
  }),
  evidence: evidenceSchema,
});
const visualEntitySchema = z.looseObject({
  entityId: identifierSchema,
  visualDescription: z.string().trim().min(1),
  importance: z.enum(["background", "supporting", "hero"]),
  materials: stringListSchema,
  colors: stringListSchema,
  condition: z.string().nullish(),
  assetSearchTags: stringListSchema,
  assetGenerationPrompt: z.string().trim().min(1).nullish(),
  evidence: evidenceSchema,
});
const presentationConnectionSchema = z.looseObject({
  entityId: identifierSchema,
  fromLocationId: identifierSchema,
  targetLocationId: identifierSchema,
  presentationOnly: z.boolean(),
  evidence: evidenceSchema,
});

export const VisualScenePlanSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  storyId: identifierSchema,
  segmentId: identifierSchema,
  sourcePassageIds: z.array(identifierSchema).min(1),
  snapshotVersion: z.number().int().nonnegative(),
  planVersion: z.number().int().positive(),
  previousPlanVersion: z.number().int().positive().nullish(),
  artDirection: z.strictObject({
    styleLabel: z.string().trim().min(1),
    stylePrompt: z.string().trim().min(1),
    negativePrompt: stringListSchema,
    materialVocabulary: stringListSchema,
  }),
  locations: z.array(visualLocationSchema).min(1),
  entities: z.array(visualEntitySchema),
  presentationConnections: z.array(presentationConnectionSchema),
  unresolvedQuestions: z.array(z.string().trim().min(1)),
});

const storyMomentSchema = z.strictObject({
  passageId: identifierSchema,
  text: z.string().trim().min(1),
  patchFromPrevious: z.unknown().optional(),
  visualPlan: VisualScenePlanSchema.optional(),
  actionLabel: z.string().trim().min(1).optional(),
});

const storyPackageShapeSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  packageId: identifierSchema,
  label: z.string().trim().min(1),
  initialSnapshot: z.unknown(),
  moments: z.array(storyMomentSchema).min(1),
});

export interface StoryPackageMoment {
  passageId: string;
  text: string;
  patchFromPrevious?: ScenePatch;
  visualPlan?: VisualScenePlan;
  actionLabel?: string;
}

export interface StoryPackage {
  schemaVersion: "1.0";
  packageId: string;
  label: string;
  initialSnapshot: WorldSnapshot;
  moments: StoryPackageMoment[];
}

export interface RuntimeStory {
  id: string;
  label: string;
  snapshot: WorldSnapshot;
  patches: ScenePatch[];
  visualPlans: VisualScenePlan[];
  passages: string[];
  nextLabels: string[];
}

export interface StoryPackagePreflightMoment {
  passageId: string;
  snapshotVersion: number;
  planVersion: number;
  status: "clean" | "review";
  score: number;
  warningCount: number;
}

export interface StoryPackagePreflightReport {
  packageId: string;
  storyId: string;
  status: "ready" | "needs_review";
  moments: StoryPackagePreflightMoment[];
}

export class StoryPackageValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Story package validation failed: ${issues.join("; ")}`);
    this.name = "StoryPackageValidationError";
    this.issues = issues;
  }
}

function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    `${issue.path.length > 0 ? issue.path.join(".") : "root"}: ${issue.message}`,
  );
}

function messageFrom(error: unknown): string {
  if (error instanceof ContractValidationError) return error.issues.join("; ");
  return error instanceof Error ? error.message : String(error);
}

/** Validates structure, version order, canonical joins, and executable recipes. */
export function validateStoryPackage(value: unknown): StoryPackage {
  const parsed = storyPackageShapeSchema.safeParse(value);
  if (!parsed.success) throw new StoryPackageValidationError(zodIssues(parsed.error));

  const issues: string[] = [];
  let snapshot: WorldSnapshot;
  try {
    snapshot = validateWorldSnapshot(parsed.data.initialSnapshot);
  } catch (error) {
    throw new StoryPackageValidationError([`initialSnapshot: ${messageFrom(error)}`]);
  }

  const moments: StoryPackageMoment[] = [];
  let activePlan: VisualScenePlan | undefined;
  let previousNewPlanVersion = 0;

  for (const [index, rawMoment] of parsed.data.moments.entries()) {
    let patch: ScenePatch | undefined;
    if (index === 0 && rawMoment.patchFromPrevious !== undefined) {
      issues.push("moments.0.patchFromPrevious: The opening moment cannot have a previous patch.");
    }
    if (index > 0 && rawMoment.patchFromPrevious === undefined) {
      issues.push(`moments.${index}.patchFromPrevious: A later moment requires a patch.`);
    }
    if (rawMoment.patchFromPrevious !== undefined) {
      try {
        patch = validateScenePatch(rawMoment.patchFromPrevious);
        snapshot = validateWorldSnapshot(applyScenePatch(snapshot, patch));
      } catch (error) {
        issues.push(`moments.${index}.patchFromPrevious: ${messageFrom(error)}`);
      }
    }

    const nextPlan = rawMoment.visualPlan as VisualScenePlan | undefined;
    if (index === 0 && !nextPlan) {
      issues.push("moments.0.visualPlan: The opening moment requires a visual plan.");
    }
    if (nextPlan) {
      if (nextPlan.storyId !== snapshot.storyId) {
        issues.push(
          `moments.${index}.visualPlan.storyId: '${nextPlan.storyId}' does not match '${snapshot.storyId}'.`,
        );
      }
      if (nextPlan.snapshotVersion > snapshot.version) {
        issues.push(
          `moments.${index}.visualPlan.snapshotVersion: v${nextPlan.snapshotVersion} is ahead of world v${snapshot.version}.`,
        );
      }
      if (nextPlan.planVersion <= previousNewPlanVersion) {
        issues.push(`moments.${index}.visualPlan.planVersion: New plan versions must increase.`);
      }
      if (
        nextPlan.previousPlanVersion !== undefined &&
        previousNewPlanVersion > 0 &&
        nextPlan.previousPlanVersion !== previousNewPlanVersion
      ) {
        issues.push(
          `moments.${index}.visualPlan.previousPlanVersion: Expected ${previousNewPlanVersion}.`,
        );
      }
      activePlan = nextPlan;
      previousNewPlanVersion = nextPlan.planVersion;
    }

    if (activePlan) {
      try {
        const recipe = compileSceneRecipe(snapshot, activePlan);
        if (recipe.composition.status === "blocking") {
          const blockingIssues = Object.values(recipe.composition.locations)
            .flatMap((location) => location.issues)
            .filter((candidate) => candidate.severity === "error");
          for (const blocking of blockingIssues) {
            issues.push(
              `moments.${index}.preflight.${blocking.code}: ${blocking.message}`,
            );
          }
        }
      } catch (error) {
        issues.push(`moments.${index}.visualPlan: ${messageFrom(error)}`);
      }
    }

    moments.push({
      passageId: rawMoment.passageId,
      text: rawMoment.text,
      patchFromPrevious: patch,
      visualPlan: nextPlan,
      actionLabel: rawMoment.actionLabel,
    });
  }

  if (issues.length > 0) throw new StoryPackageValidationError(issues);
  return {
    schemaVersion: "1.0",
    packageId: parsed.data.packageId,
    label: parsed.data.label,
    initialSnapshot: validateWorldSnapshot(parsed.data.initialSnapshot),
    moments,
  };
}

export function parseStoryPackageJson(json: string): StoryPackage {
  try {
    return validateStoryPackage(JSON.parse(json) as unknown);
  } catch (error) {
    if (error instanceof StoryPackageValidationError) throw error;
    throw new StoryPackageValidationError([
      error instanceof SyntaxError ? `JSON: ${error.message}` : messageFrom(error),
    ]);
  }
}

export function runtimeStoryFromPackage(value: unknown): RuntimeStory {
  const storyPackage = validateStoryPackage(value);
  return {
    id: storyPackage.packageId,
    label: storyPackage.label,
    snapshot: storyPackage.initialSnapshot,
    patches: storyPackage.moments.flatMap((moment) =>
      moment.patchFromPrevious ? [moment.patchFromPrevious] : [],
    ),
    visualPlans: storyPackage.moments.flatMap((moment) =>
      moment.visualPlan ? [moment.visualPlan] : [],
    ),
    passages: storyPackage.moments.map((moment) => moment.text),
    nextLabels: storyPackage.moments.slice(1).map((moment) =>
      moment.actionLabel ?? `Apply ${moment.passageId}`,
    ),
  };
}

/** Runs the same deterministic composition gate used by imported and built-in stories. */
export function preflightStoryPackage(value: unknown): StoryPackagePreflightReport {
  const storyPackage = validateStoryPackage(value);
  let snapshot = storyPackage.initialSnapshot;
  let activePlan: VisualScenePlan | undefined;
  const moments: StoryPackagePreflightMoment[] = [];

  for (const moment of storyPackage.moments) {
    if (moment.patchFromPrevious) snapshot = applyScenePatch(snapshot, moment.patchFromPrevious);
    if (moment.visualPlan) activePlan = moment.visualPlan;
    if (!activePlan) continue;
    const composition = compileSceneRecipe(snapshot, activePlan).composition;
    moments.push({
      passageId: moment.passageId,
      snapshotVersion: snapshot.version,
      planVersion: activePlan.planVersion,
      status: composition.status === "clean" ? "clean" : "review",
      score: composition.score,
      warningCount: composition.warningCount,
    });
  }

  return {
    packageId: storyPackage.packageId,
    storyId: storyPackage.initialSnapshot.storyId,
    status: moments.some((moment) => moment.status === "review") ? "needs_review" : "ready",
    moments,
  };
}
