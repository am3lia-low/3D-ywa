import { describe, expect, it } from "vitest";

import {
  isPracticalLightAssetKey,
  practicalLightMaterialRole,
} from "./practicalLightMaterials";

describe("practical light material classification", () => {
  it("recognises imported practical lights without treating furniture as lights", () => {
    expect(isPracticalLightAssetKey("ornate-street-lamp")).toBe(true);
    expect(isPracticalLightAssetKey("victorian-wall-street-lamp")).toBe(true);
    expect(isPracticalLightAssetKey("maritime-wooden-lantern")).toBe(true);
    expect(isPracticalLightAssetKey("lantern-chandelier")).toBe(true);
    expect(isPracticalLightAssetKey("painted-schoolroom-chair")).toBe(false);
  });

  it("targets only visible bulb and glass surfaces inside an imported model", () => {
    expect(practicalLightMaterialRole("street_lamp_01_bulb")).toBe("bulb");
    expect(practicalLightMaterialRole("street_lamp_01_glass")).toBe("glass");
    expect(practicalLightMaterialRole("wooden_lantern_01_glass")).toBe("glass");
    expect(practicalLightMaterialRole("street_lamp_01")).toBeNull();
    expect(practicalLightMaterialRole("painted_wood")).toBeNull();
  });
});
