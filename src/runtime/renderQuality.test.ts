import { describe, expect, it } from "vitest";
import {
  qualityForPerformanceFactor,
  renderQualityProfiles,
} from "./renderQuality";

describe("adaptive render quality", () => {
  it("uses stable thresholds for low, balanced and high tiers", () => {
    expect(qualityForPerformanceFactor(0.2)).toBe("low");
    expect(qualityForPerformanceFactor(0.6)).toBe("balanced");
    expect(qualityForPerformanceFactor(0.95)).toBe("high");
  });

  it("disables the expensive shadow pass only in the low tier", () => {
    expect(renderQualityProfiles.low.shadows).toBe(false);
    expect(renderQualityProfiles.balanced.shadows).toBe(true);
    expect(renderQualityProfiles.high.shadows).toBe(true);
  });
});
