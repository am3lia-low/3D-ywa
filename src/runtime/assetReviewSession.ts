import type { VisualScenePlan } from "../contracts/visualScenePlan";
import type { WorldSnapshot } from "../contracts/world";
import type { AssetDefinition, AssetRegistry } from "./assetRegistry";
import type { GeneratedReferenceImage } from "./referenceImageProvider";
import { buildSceneManifest, type SceneBuildManifest } from "./sceneBuildPipeline";
import type { SceneAssetReconstructionProvider } from "./sceneAssetQueue";

export const INLINE_SURFACE_REFERENCE_URL = "storyworld-candidate://approved-reference";

export function materializeInlineSurfaceAsset(
  asset: AssetDefinition,
  reference?: GeneratedReferenceImage,
): AssetDefinition {
  if (asset.surfaceTextureUrl !== INLINE_SURFACE_REFERENCE_URL) return asset;
  if (!reference) throw new Error("Inline surface asset is missing its approved reference image.");
  return {
    ...asset,
    surfaceTextureUrl: `data:${reference.mimeType};base64,${reference.base64}`,
  };
}

export function buildRegenerationManifest(
  snapshot: WorldSnapshot,
  plan: VisualScenePlan,
  entityId: string,
  registry: AssetRegistry,
): SceneBuildManifest {
  const entity = snapshot.entities.find((candidate) => candidate.id === entityId);
  if (!entity) {
    throw new Error(`World snapshot does not contain canonical entity '${entityId}'.`);
  }
  if (!plan.entities.some((candidate) => candidate.entityId === entityId)) {
    throw new Error(`Visual plan does not describe canonical entity '${entityId}'.`);
  }

  const mutableRegistry = { ...registry };
  delete mutableRegistry[entity.id];
  delete mutableRegistry[entity.assetKey ?? entity.kind];

  const manifest = buildSceneManifest(snapshot, plan, [], mutableRegistry);
  if (!manifest.generationJobs.some((job) => job.entityId === entityId)) {
    throw new Error(`Entity '${entityId}' did not produce a regeneration job.`);
  }

  return {
    ...manifest,
    generationJobs: manifest.generationJobs.filter((job) => job.entityId === entityId),
  };
}

/** Browser-local surface route. Production can upload the same bytes to object storage. */
export function createInlineSurfaceTemplateProvider(): SceneAssetReconstructionProvider {
  return {
    id: "inline-surface-template",
    source: "generated",
    async reconstruct(job, reference) {
      if (job.strategy !== "surface_template") {
        throw new Error(`Inline surface provider cannot reconstruct '${job.strategy}'.`);
      }

      return {
        artifactId: reference.artifactId ?? `inline-surface:${job.entityId}`,
        asset: {
          key: `generated-surface:${job.entityKind}`,
          geometry: "box",
          dimensions: job.dimensions ?? [1, 1, 0.08],
          color: "#ffffff",
          // Keep one persisted copy of the image; the review UI materializes this URL on demand.
          surfaceTextureUrl: INLINE_SURFACE_REFERENCE_URL,
          roughness: 0.88,
        },
      };
    },
  };
}
