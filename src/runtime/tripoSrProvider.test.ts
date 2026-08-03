import { describe, expect, it, vi } from "vitest";
import type { SceneAssetGenerationJob } from "./sceneBuildPipeline";
import {
  createTripoSrHttpProvider,
  type SceneReferenceImageProvider,
} from "./tripoSrProvider";

const job: SceneAssetGenerationJob = {
  entityId: "lantern-1",
  locationId: "attic-study",
  entityKind: "lantern",
  dimensions: [0.45, 0.8, 0.45],
  prompt: "ornate aged brass oil lantern",
  searchTags: ["lantern", "brass"],
  priority: "hero",
  reason: "no_catalog_match",
};

const referenceImages: SceneReferenceImageProvider = {
  id: "fixture-imagegen",
  generate: vi.fn(async () => ({
    mimeType: "image/png" as const,
    base64: "cG5n",
    artifactId: "reference:lantern-1",
  })),
};

describe("TripoSR provider", () => {
  it("reconstructs a reference image and preserves canonical scale metadata", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        entityId: "lantern-1",
        image: { mimeType: "image/png", base64: "cG5n" },
        meshResolution: 192,
        referenceArtifactId: "reference:lantern-1",
      });
      return new Response(
        JSON.stringify({
          artifactId: "triposr:lantern-1:abc123",
          modelUrl: "/generated/lantern-1-abc123.glb",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const provider = createTripoSrHttpProvider({
      endpoint: "http://127.0.0.1:8123/",
      referenceImages,
      fetch: request as typeof fetch,
      meshResolution: 192,
    });

    const result = await provider.generate(job);

    expect(provider.id).toBe("triposr:fixture-imagegen");
    expect(request).toHaveBeenCalledWith(
      "http://127.0.0.1:8123/v1/reconstruct",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({
      artifactId: "triposr:lantern-1:abc123",
      asset: {
        key: "generated:lantern",
        geometry: "box",
        dimensions: [0.45, 0.8, 0.45],
        color: "#b7aa94",
        modelUrl: "/generated/lantern-1-abc123.glb",
        roughness: 0.72,
      },
    });
  });

  it("reports service failures without fabricating an asset", async () => {
    const provider = createTripoSrHttpProvider({
      endpoint: "http://127.0.0.1:8123",
      referenceImages,
      fetch: vi.fn(async () => new Response("CUDA out of memory", { status: 503 })) as typeof fetch,
    });

    await expect(provider.generate(job)).rejects.toThrow(
      "TripoSR request failed (503): CUDA out of memory",
    );
  });
});
