import { describe, expect, it, vi } from "vitest";
import type { SceneAssetGenerationJob } from "./sceneBuildPipeline";
import {
  buildSdxlReferenceWorkflow,
  createComfyUiReferenceImageProvider,
} from "./comfyUiReferenceImageProvider";

const job: SceneAssetGenerationJob = {
  entityId: "lantern-1",
  locationId: "attic-study",
  entityKind: "lantern",
  dimensions: [0.45, 0.8, 0.45],
  prompt: "An ornate aged brass oil lantern with clear glass panels. Condition: unlit.",
  searchTags: ["lantern", "brass"],
  priority: "hero",
  strategy: "image_to_mesh",
  reason: "no_catalog_match",
};

describe("ComfyUI reference image provider", () => {
  it("builds the approved isolated-object SDXL workflow", () => {
    const workflow = buildSdxlReferenceWorkflow(job, {
      checkpointName: "sd_xl_base_1.0.safetensors",
      width: 1024,
      height: 1024,
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "sgm_uniform",
      negativePrompt: "multiple objects, room",
      seedOffset: 7,
      pollIntervalMs: 0,
      timeoutMs: 10_000,
    });

    expect(workflow["1"]?.inputs.ckpt_name).toBe("sd_xl_base_1.0.safetensors");
    expect(workflow["2"]?.inputs.text).toContain("exactly one object");
    expect(workflow["2"]?.inputs.text).toContain("no light source installed");
    expect(workflow["3"]?.inputs.text).toContain("candle");
    expect(workflow["5"]?.inputs).toMatchObject({
      steps: 4,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "sgm_uniform",
    });
    expect(workflow["7"]?.inputs.filename_prefix).toBe("storyworld/lantern-1");
  });

  it("does not suppress light sources for assets described as lit", () => {
    const litWorkflow = buildSdxlReferenceWorkflow(
      { ...job, prompt: "A lit brass oil lantern with a warm flame." },
      {
        checkpointName: "sd_xl_base_1.0.safetensors",
        width: 1024,
        height: 1024,
        steps: 24,
        cfg: 6.5,
        samplerName: "dpmpp_2m",
        scheduler: "karras",
        negativePrompt: "multiple objects, room",
        seedOffset: 0,
        pollIntervalMs: 0,
        timeoutMs: 10_000,
      },
    );

    expect(litWorkflow["3"]?.inputs.text).toBe("multiple objects, room");
  });

  it("queues, polls, and downloads a generated reference image", async () => {
    let historyCalls = 0;
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/prompt")) {
        const body = JSON.parse(String(init?.body));
        expect(body.prompt["2"].inputs.text).toContain(job.prompt);
        return new Response(JSON.stringify({ prompt_id: "prompt-123", number: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/history/prompt-123")) {
        historyCalls += 1;
        return new Response(
          JSON.stringify(
            historyCalls === 1
              ? {}
              : {
                  "prompt-123": {
                    status: { completed: true, status_str: "success" },
                    outputs: {
                      "7": {
                        images: [
                          { filename: "lantern-1_00001_.png", subfolder: "storyworld", type: "output" },
                        ],
                      },
                    },
                  },
                },
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/view?")) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const provider = createComfyUiReferenceImageProvider({
      endpoint: "http://127.0.0.1:8188/",
      fetch: request as typeof fetch,
      pollIntervalMs: 0,
      timeoutMs: 10_000,
    });

    const result = await provider.generate(job);

    expect(provider.id).toBe("comfyui:sdxl-base-1.0");
    expect(historyCalls).toBe(2);
    expect(result).toEqual({
      mimeType: "image/png",
      base64: "iVBORw==",
      artifactId: "comfyui:prompt-123:storyworld/lantern-1_00001_.png",
    });
  });

  it("keeps ComfyUI failures explicit and retryable", async () => {
    const provider = createComfyUiReferenceImageProvider({
      endpoint: "http://127.0.0.1:8188",
      fetch: vi.fn(async () => new Response("checkpoint missing", { status: 400 })) as typeof fetch,
    });

    await expect(provider.generate(job)).rejects.toThrow(
      "ComfyUI queue failed (400): checkpoint missing",
    );
  });
});
