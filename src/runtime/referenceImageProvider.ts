import type { SceneAssetGenerationJob } from "./sceneBuildPipeline";

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

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
