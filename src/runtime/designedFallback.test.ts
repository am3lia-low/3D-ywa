import { describe, expect, it } from "vitest";
import type { Entity } from "../contracts/world";
import { designedFallbackDimensions, designedFallbackKind } from "./designedFallback";

function entity(kind: string, name: string): Entity {
  return { id: `${kind}-1`, kind, name, locationId: "unknown-place" };
}

describe("designed semantic fallbacks", () => {
  it.each([
    ["character", "The night watchman", "person"],
    ["furniture", "Velvet reading chair", "seat"],
    ["furniture", "Unfamiliar writing desk", "table"],
    ["document", "Sealed letter", "document"],
    ["architecture", "Bronze portal", "portal"],
    ["decor", "Painted ceramic urn", "vessel"],
    ["flora", "Silver fern", "plant"],
  ])("maps %s / %s to %s", (kind, name, expected) => {
    expect(designedFallbackKind(entity(kind, name))).toBe(expected);
  });

  it("uses human-scale dimensions for unresolved characters", () => {
    expect(designedFallbackDimensions(entity("character", "Unknown traveller"))).toEqual([
      0.62,
      1.75,
      0.5,
    ]);
  });

  it("keeps unresolved documents thin enough for support-surface placement", () => {
    const dimensions = designedFallbackDimensions(entity("document", "Folded dispatch"));
    expect(dimensions[1]).toBeLessThan(0.1);
  });
});
