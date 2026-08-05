import type { Vector3Tuple } from "../contracts/world";
import type { SceneAssetGenerationJob } from "./sceneBuildPipeline";
import type { SceneAssetProvider } from "./sceneAssetWorker";
import type { SceneAssetReconstructionProvider } from "./sceneAssetQueue";
import {
  arrayBufferToBase64,
  type SceneReferenceImageProvider,
} from "./referenceImageProvider";

export type {
  GeneratedReferenceImage,
  SceneReferenceImageProvider,
} from "./referenceImageProvider";

export interface TripoSrHttpProviderOptions {
  endpoint: string;
  referenceImages: SceneReferenceImageProvider;
  fetch?: typeof fetch;
  meshResolution?: number;
  defaultDimensions?: Vector3Tuple;
}

export type TripoSrReconstructionProviderOptions = Omit<
  TripoSrHttpProviderOptions,
  "referenceImages"
>;

interface TripoSrResponse {
  artifactId: string;
  modelUrl: string;
}

function isTripoSrResponse(value: unknown): value is TripoSrResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TripoSrResponse>;
  return (
    typeof candidate.artifactId === "string" &&
    candidate.artifactId.length > 0 &&
    typeof candidate.modelUrl === "string" &&
    candidate.modelUrl.length > 0
  );
}

function positiveResolution(value: number | undefined): number {
  if (value === undefined) return 256;
  if (!Number.isInteger(value) || value < 64 || value > 512) {
    throw new Error("TripoSR meshResolution must be an integer from 64 to 512.");
  }
  return value;
}

/**
 * Adapts the local persistent TripoSR service to the provider-neutral worker.
 * TripoSR is deliberately not given the prose prompt directly: a separate
 * provider first turns that prompt into a clean reconstruction reference.
 */
export function createTripoSrHttpProvider(
  options: TripoSrHttpProviderOptions,
): SceneAssetProvider {
  const reconstruction = createTripoSrReconstructionProvider(options);

  return {
    id: `triposr:${options.referenceImages.id}`,
    source: reconstruction.source,
    async generate(job, signal) {
      const reference = await options.referenceImages.generate(job, signal);
      return reconstruction.reconstruct(job, reference, signal);
    },
  };
}

/** Reconstructs an already reviewed reference without generating a second image. */
export function createTripoSrReconstructionProvider(
  options: TripoSrReconstructionProviderOptions,
): SceneAssetReconstructionProvider {
  const request = options.fetch ?? fetch;
  const endpoint = options.endpoint.replace(/\/+$/, "");
  const meshResolution = positiveResolution(options.meshResolution);
  const defaultDimensions = options.defaultDimensions ?? [1, 1, 1];

  return {
    id: "triposr-local",
    source: "generated",
    async reconstruct(job, reference, signal) {
      if (job.strategy !== "image_to_mesh") {
        throw new Error(`TripoSR cannot reconstruct '${job.strategy}' asset '${job.entityId}'.`);
      }
      const response = await request(`${endpoint}/v1/reconstruct`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          entityId: job.entityId,
          image: { mimeType: reference.mimeType, base64: reference.base64 },
          meshResolution,
          referenceArtifactId: reference.artifactId,
        }),
      });

      if (!response.ok) {
        const details = (await response.text()).trim();
        throw new Error(
          `TripoSR request failed (${response.status})${details ? `: ${details}` : "."}`,
        );
      }

      const payload: unknown = await response.json();
      if (!isTripoSrResponse(payload)) {
        throw new Error("TripoSR returned an invalid reconstruction response.");
      }

      return {
        artifactId: payload.artifactId,
        asset: {
          key: `generated:${job.entityKind}`,
          geometry: "box",
          dimensions: job.dimensions ?? defaultDimensions,
          color: "#b7aa94",
          modelUrl: payload.modelUrl,
          roughness: 0.72,
        },
      };
    },
  };
}

/** Loads a project-owned reference image without coupling the worker to ImageGen. */
export function createStaticReferenceImageProvider(
  imageUrlForJob: (job: SceneAssetGenerationJob) => string,
  fetchImpl: typeof fetch = fetch,
): SceneReferenceImageProvider {
  return {
    id: "project-reference-image",
    async generate(job, signal) {
      const imageUrl = imageUrlForJob(job);
      const response = await fetchImpl(imageUrl, { signal });
      if (!response.ok) {
        throw new Error(`Reference image request failed (${response.status}) for '${imageUrl}'.`);
      }
      const mimeType = response.headers.get("content-type")?.split(";")[0];
      if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") {
        throw new Error(`Unsupported reference image type '${mimeType ?? "unknown"}'.`);
      }
      return {
        mimeType,
        base64: arrayBufferToBase64(await response.arrayBuffer()),
        artifactId: imageUrl,
      };
    },
  };
}
