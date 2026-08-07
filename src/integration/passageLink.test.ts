import { describe, expect, it } from "vitest";
import { findEvidencePassage } from "../../Create UI Prototype for Hackathon/src/passageLink";

describe("passage evidence linking", () => {
  const passage = [
    "The front hall smelled of beeswax and something older.",
    "A fireplace dominated the north wall, cold now, its mantelpiece bearing a row of framed photographs and a single brass clock that had stopped at twenty past four.",
    "Above the fireplace hung a portrait she did not recognise.",
  ].join(" ");

  it("uses trusted character offsets when Member 1 supplies them", () => {
    const start = passage.indexOf("Above the fireplace");
    expect(findEvidencePassage(passage, "different summary", start, passage.length)).toEqual({
      start,
      end: passage.length,
      score: 1,
      exact: true,
    });
  });

  it("links an exact evidence quote", () => {
    const evidence = "Above the fireplace hung a portrait she did not recognise."
    const match = findEvidencePassage(passage, evidence)
    expect(match?.exact).toBe(true)
    expect(passage.slice(match!.start, match!.end)).toBe(evidence)
  });

  it("finds the original sentence when extraction stores a shortened summary", () => {
    const evidence = "A fireplace dominated the north wall, cold now, its mantelpiece bearing a row of framed photographs."
    const match = findEvidencePassage(passage, evidence)
    expect(match?.exact).toBe(false)
    expect(match?.score).toBeGreaterThan(0.7)
    expect(passage.slice(match!.start, match!.end)).toContain("single brass clock")
  });
})
