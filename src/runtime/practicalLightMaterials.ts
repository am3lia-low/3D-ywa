export type PracticalLightMaterialRole = "bulb" | "glass" | null;

const PRACTICAL_LIGHT_KEY = /(?:^|[-_])(lamp|lantern|chandelier|sconce)(?:$|[-_])/i;
const BULB_MATERIAL = /(?:^|[-_.\s])(bulb|flame|wick|emissive|light[ _-]?source)(?:$|[-_.\s])/i;
const GLASS_MATERIAL = /(?:^|[-_.\s])(glass|shade|diffuser|chimney)(?:$|[-_.\s])/i;

export function isPracticalLightAssetKey(assetKey: string): boolean {
  return PRACTICAL_LIGHT_KEY.test(assetKey);
}

export function practicalLightMaterialRole(materialName: string): PracticalLightMaterialRole {
  if (BULB_MATERIAL.test(materialName)) return "bulb";
  if (GLASS_MATERIAL.test(materialName)) return "glass";
  return null;
}
