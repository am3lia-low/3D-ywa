import type { Vector3Tuple } from "../contracts/world";
import type { SceneAssetGenerationJob } from "./sceneBuildPipeline";
import type { SceneAssetProvider } from "./sceneAssetWorker";

export interface GeneratedReferenceImage {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
  artifactId?: string;
}

/** Text-to-image or curated-image boundary that runs before image-to-3D. */
export interface SceneReferenceImageProvider {
  id: string;
  generate(
    job: SceneAssetGenerationJob,
    signal?: AbortSignal,
  ): Promise<GeneratedReferenceImage>;
}

export interface TripoSrHttpProviderOptions {
  endpoint: string;
  referenceImages: SceneReferenceImageProvider;
  fetch?: typeof fetch;
  meshResolution?: number;
  defaultDimensions?: Vector3Tuple;
}

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
  const request = options.fetch ?? fetch;
  const endpoint = options.endpoint.replace(/\/+$/, "");
  const meshResolution = positiveResolution(options.meshResolution);
  const defaultDimensions = options.defaultDimensions ?? [1, 1, 1];

  return {
    id: `triposr:${options.referenceImages.id}`,
    source: "generated",
    async generate(job, signal) {
      const reference = await options.referenceImages.generate(job, signal);
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
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return {
        mimeType,
        base64: btoa(binary),
        artifactId: imageUrl,
      };
    },
  };
}
