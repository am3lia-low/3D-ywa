export type RenderQuality = "low" | "balanced" | "high";

export interface RenderQualityProfile {
  dpr: number | [number, number];
  shadows: boolean;
}

export const renderQualityProfiles: Readonly<Record<RenderQuality, RenderQualityProfile>> = {
  low: { dpr: [0.75, 1], shadows: false },
  balanced: { dpr: [1, 1.4], shadows: true },
  high: { dpr: [1, 1.75], shadows: true },
};

/** Maps Drei's normalized performance factor to a stable render tier. */
export function qualityForPerformanceFactor(factor: number): RenderQuality {
  if (factor < 0.42) return "low";
  if (factor > 0.78) return "high";
  return "balanced";
}
