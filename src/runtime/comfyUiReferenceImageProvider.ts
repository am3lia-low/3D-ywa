import type { SceneAssetGenerationJob } from "./sceneBuildPipeline";
import {
  arrayBufferToBase64,
  type GeneratedReferenceImage,
  type SceneReferenceImageProvider,
} from "./referenceImageProvider";

type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
};

type ComfyWorkflow = Record<string, WorkflowNode>;

interface ComfyOutputImage {
  filename: string;
  subfolder: string;
  type: string;
}

interface ComfyHistoryEntry {
  outputs?: Record<string, { images?: ComfyOutputImage[] }>;
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: unknown[];
  };
}

interface ComfyCheckpointInfo {
  CheckpointLoaderSimple?: {
    input?: {
      required?: {
        ckpt_name?: [unknown];
      };
    };
  };
}

export interface ComfyUiReferenceImageProviderOptions {
  endpoint: string;
  checkpointName?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
  negativePrompt?: string;
  seedOffset?: number;
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const DEFAULT_NEGATIVE = [
  "contact sheet",
  "catalog sheet",
  "grid",
  "collage",
  "collection",
  "lineup",
  "repeating pattern",
  "multiple objects",
  "object parts",
  "room",
  "environment",
  "floor",
  "pedestal",
  "cast shadow",
  "cropped",
  "cut off",
  "person",
  "hand",
  "text",
  "label",
  "watermark",
  "low detail",
  "deformed",
  "duplicate",
].join(", ");

function boundedInteger(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function boundedNumber(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be from ${minimum} to ${maximum}.`);
  }
  return value;
}

function stableSeed(job: SceneAssetGenerationJob, seedOffset = 0): number {
  let hash = 2166136261;
  for (const character of `${job.entityId}\n${job.prompt}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) + seedOffset) >>> 0;
}

function safePrefix(entityId: string): string {
  return entityId.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "asset";
}

function reconstructionPrompt(job: SceneAssetGenerationJob): string {
  const unlitGuard = /\bunlit\b/i.test(job.prompt)
    ? "empty dark chamber with no light source installed, strictly unlit"
    : undefined;
  return [
    "A single standalone object, exactly one object in the image",
    unlitGuard,
    job.prompt.trim(),
    "centered front three-quarter view, entire object visible with empty space around it",
    "plain light gray seamless background, realistic materials, coherent proportions",
  ]
    .filter(Boolean)
    .join(", ");
}

function reconstructionNegativePrompt(job: SceneAssetGenerationJob, basePrompt: string): string {
  if (!/\bunlit\b/i.test(job.prompt)) return basePrompt;
  return `${basePrompt}, flame, candle, light bulb, glowing, lit interior`;
}

function availableCheckpoints(value: unknown): string[] {
  const names = (value as ComfyCheckpointInfo)?.CheckpointLoaderSimple?.input?.required
    ?.ckpt_name?.[0];
  return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : [];
}

export function buildSdxlReferenceWorkflow(
  job: SceneAssetGenerationJob,
  options: Omit<Required<ComfyUiReferenceImageProviderOptions>, "endpoint" | "fetch">,
): ComfyWorkflow {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: options.checkpointName },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: reconstructionPrompt(job), clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: reconstructionNegativePrompt(job, options.negativePrompt), clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: options.width, height: options.height, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: stableSeed(job, options.seedOffset),
        steps: options.steps,
        cfg: options.cfg,
        sampler_name: options.samplerName,
        scheduler: options.scheduler,
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: `storyworld/${safePrefix(job.entityId)}`,
        images: ["6", 0],
      },
    },
  };
}

function outputImage(entry: ComfyHistoryEntry): ComfyOutputImage | undefined {
  for (const output of Object.values(entry.outputs ?? {})) {
    const image = output.images?.[0];
    if (image) return image;
  }
  return undefined;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Image generation aborted."));
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("Image generation aborted."));
      },
      { once: true },
    );
  });
}

/** Runs the approved core-node SDXL workflow against local ComfyUI. */
export function createComfyUiReferenceImageProvider(
  input: ComfyUiReferenceImageProviderOptions,
): SceneReferenceImageProvider {
  const request = input.fetch ?? fetch;
  const endpoint = input.endpoint.replace(/\/+$/, "");
  const settings = {
    checkpointName: input.checkpointName ?? "sd_xl_base_1.0.safetensors",
    width: boundedInteger("width", input.width ?? 1024, 512, 1536),
    height: boundedInteger("height", input.height ?? 1024, 512, 1536),
    steps: boundedInteger("steps", input.steps ?? 24, 1, 50),
    cfg: boundedNumber("cfg", input.cfg ?? 6.5, 0, 20),
    samplerName: input.samplerName ?? "dpmpp_2m",
    scheduler: input.scheduler ?? "karras",
    negativePrompt: input.negativePrompt ?? DEFAULT_NEGATIVE,
    seedOffset: boundedInteger("seedOffset", input.seedOffset ?? 0, 0, 4_294_967_295),
    pollIntervalMs: boundedInteger("pollIntervalMs", input.pollIntervalMs ?? 500, 0, 10_000),
    timeoutMs: boundedInteger("timeoutMs", input.timeoutMs ?? 300_000, 1_000, 900_000),
  };

  return {
    id: "comfyui:sdxl-base-1.0",
    async generate(job, signal): Promise<GeneratedReferenceImage> {
      let checkpointName = settings.checkpointName;
      if (!input.checkpointName) {
        try {
          const info = await request(`${endpoint}/object_info/CheckpointLoaderSimple`, { signal });
          if (info.ok) {
            const installed = availableCheckpoints(await info.json());
            if (!installed.includes(checkpointName) && installed[0]) checkpointName = installed[0];
          }
        } catch {
          // Older or proxied ComfyUI servers may not expose discovery; queueing remains authoritative.
        }
      }
      const lightning = /lightning/i.test(checkpointName);
      const workflow = buildSdxlReferenceWorkflow(job, {
        ...settings,
        checkpointName,
        steps: input.steps ?? (lightning ? 4 : settings.steps),
        cfg: input.cfg ?? (lightning ? 1 : settings.cfg),
        samplerName: input.samplerName ?? (lightning ? "euler" : settings.samplerName),
        scheduler: input.scheduler ?? (lightning ? "sgm_uniform" : settings.scheduler),
      });
      const clientId = `storyworld-${safePrefix(job.entityId)}-${stableSeed(job, settings.seedOffset)}`;
      const queued = await request(`${endpoint}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        signal,
      });
      if (!queued.ok) {
        throw new Error(`ComfyUI queue failed (${queued.status}): ${(await queued.text()).trim()}`);
      }
      const queuePayload = (await queued.json()) as { prompt_id?: unknown; error?: unknown };
      if (typeof queuePayload.prompt_id !== "string" || !queuePayload.prompt_id) {
        throw new Error(`ComfyUI did not return a prompt ID${queuePayload.error ? `: ${String(queuePayload.error)}` : "."}`);
      }

      const startedAt = Date.now();
      let image: ComfyOutputImage | undefined;
      while (Date.now() - startedAt < settings.timeoutMs) {
        await delay(settings.pollIntervalMs, signal);
        const history = await request(
          `${endpoint}/history/${encodeURIComponent(queuePayload.prompt_id)}`,
          { signal },
        );
        if (!history.ok) throw new Error(`ComfyUI history failed (${history.status}).`);
        const payload = (await history.json()) as Record<string, ComfyHistoryEntry>;
        const entry = payload[queuePayload.prompt_id];
        if (!entry) continue;
        image = outputImage(entry);
        if (image) break;
        if (entry.status?.completed || entry.status?.status_str === "error") {
          throw new Error(`ComfyUI workflow finished without an image (${entry.status.status_str ?? "unknown"}).`);
        }
      }
      if (!image) throw new Error(`ComfyUI image generation timed out after ${settings.timeoutMs}ms.`);

      const query = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder,
        type: image.type,
      });
      const downloaded = await request(`${endpoint}/view?${query}`, { signal });
      if (!downloaded.ok) throw new Error(`ComfyUI image download failed (${downloaded.status}).`);
      const mimeType = downloaded.headers.get("content-type")?.split(";")[0];
      if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") {
        throw new Error(`ComfyUI returned unsupported image type '${mimeType ?? "unknown"}'.`);
      }
      return {
        mimeType,
        base64: arrayBufferToBase64(await downloaded.arrayBuffer()),
        artifactId: `comfyui:${queuePayload.prompt_id}:${image.subfolder}/${image.filename}`,
      };
    },
  };
}
