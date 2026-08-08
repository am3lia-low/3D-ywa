import type { Entity, Vector3Tuple } from "../contracts/world";

export type DesignedFallbackKind =
  | "person"
  | "seat"
  | "table"
  | "container"
  | "portal"
  | "light"
  | "document"
  | "plant"
  | "vessel"
  | "surface"
  | "artifact";

function fallbackSemanticText(entity: Entity): string {
  return [entity.kind, entity.name, entity.assetKey, ...(entity.aliases ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Selects a readable presentation fallback without claiming a factual asset identity. */
export function designedFallbackKind(entity: Entity): DesignedFallbackKind {
  const text = fallbackSemanticText(entity);
  if (/\b(character|person|human|woman|man|girl|boy|figure|travell?er|guard|merchant)\b/.test(text)) return "person";
  if (/\b(chair|seat|stool|bench|sofa|couch|throne)\b/.test(text)) return "seat";
  if (/\b(table|desk|counter|workbench|lectern|furniture)\b/.test(text)) return "table";
  if (/\b(container|crate|chest|box|trunk|basket|coffer|cabinet)\b/.test(text)) return "container";
  if (/\b(door|gate|portal|hatch|window|archway|architecture)\b/.test(text)) return "portal";
  if (/\b(light|lamp|lantern|candle|torch|sconce|brazier)\b/.test(text)) return "light";
  if (/\b(document|book|map|letter|scroll|page|parchment|journal|diary|note)\b/.test(text)) return "document";
  if (/\b(plant|flower|tree|sapling|shrub|bush|fern|herb|flora)\b/.test(text)) return "plant";
  // Flat things other objects rest on. Checked before `vessel` so a tray is not
  // sized as an urn: an 0.8m-tall tray puts whatever sits on it far above the
  // table and fails the geometric support audit.
  if (/\b(tray|salver|platter|plate|mat|coaster|board)\b/.test(text)) return "surface";
  if (/\b(vase|vessel|bottle|jar|urn|pot|cup|goblet)\b/.test(text)) return "vessel";
  return "artifact";
}

const FALLBACK_DIMENSIONS: Readonly<Record<DesignedFallbackKind, Vector3Tuple>> = {
  person: [0.62, 1.75, 0.5],
  seat: [0.72, 1.02, 0.72],
  table: [1.35, 0.84, 0.78],
  container: [0.84, 0.58, 0.64],
  portal: [1.15, 2.2, 0.22],
  light: [0.42, 0.76, 0.42],
  document: [0.62, 0.08, 0.44],
  plant: [0.65, 1.05, 0.65],
  vessel: [0.5, 0.8, 0.5],
  // Flat and broad: a tray is a support, not a vessel. An earlier `vessel`
  // classification made it 0.8m tall, which lifted everything resting on it
  // clear of the table and failed the geometric support audit.
  surface: [0.72, 0.05, 0.58],
  artifact: [0.65, 0.75, 0.65],
};

export function designedFallbackDimensions(entity: Entity): Vector3Tuple {
  return [...FALLBACK_DIMENSIONS[designedFallbackKind(entity)]];
}
