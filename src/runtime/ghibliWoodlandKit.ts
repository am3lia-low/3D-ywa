import type { Vector3Tuple } from "../contracts/world";
import type { RenderQuality } from "./renderQuality";

export type WoodlandMood = "misty" | "sunlit" | "autumn" | "moonlit" | "neutral";
export type WoodlandTreeVariant =
  | "broadleaf-1"
  | "broadleaf-3"
  | "broadleaf-5"
  | "pine-1"
  | "pine-3"
  | "pine-5"
  | "twisted-2";
export type WoodlandGroundVariant =
  | "flower-bush"
  | "fern"
  | "flowers"
  | "wispy-grass"
  | "mushrooms"
  | "rock-1"
  | "rock-2"
  | "rock-3";

export interface WoodlandPlacement<TVariant extends string> {
  variant: TVariant;
  position: Vector3Tuple;
  rotationY: number;
  scale: Vector3Tuple;
  foreground: boolean;
}

export interface GhibliWoodlandLayout {
  seed: number;
  mood: WoodlandMood;
  pathPhase: number;
  pathAmplitude: number;
  pathWidth: number;
  trees: WoodlandPlacement<WoodlandTreeVariant>[];
  groundCover: WoodlandPlacement<WoodlandGroundVariant>[];
}

export interface GhibliWoodlandInput {
  /** Canonical location identity. Story identity is deliberately not accepted. */
  locationId: string;
  bounds: Vector3Tuple;
  archetype: string;
  visualDescription: string;
  mood: string;
  timeOfDay: string;
  architectureTags: readonly string[];
  dressingTags: readonly string[];
  dressingDensity: "sparse" | "moderate" | "rich";
  quality: RenderQuality;
}

export function stableWoodlandSeed(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function randomFromSeed(seed: number): () => number {
  let state = seed || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function semanticText(input: GhibliWoodlandInput): string {
  return [
    input.archetype,
    input.visualDescription,
    input.mood,
    input.timeOfDay,
    ...input.architectureTags,
    ...input.dressingTags,
  ].join(" ").toLowerCase();
}

export function resolveWoodlandMood(description: string): WoodlandMood {
  if (/\b(?:autumn|fall|amber|russet|golden-leaf|red-leaf)\w*\b/.test(description)) return "autumn";
  if (/\b(?:night|moon|moonlit|starlit|midnight|twilight)\w*\b/.test(description)) return "moonlit";
  if (/\b(?:mist|fog|haze|blue dawn|rain|mosswood)\w*\b/.test(description)) return "misty";
  if (/\b(?:sun|sunlit|golden|spring|flower|bright|morning|grove|glade)\w*\b/.test(description)) return "sunlit";
  return "neutral";
}

export function woodlandPathCenter(
  z: number,
  bounds: Vector3Tuple,
  phase: number,
  amplitude: number,
): number {
  const progress = Math.min(1, Math.max(0, z / bounds[2] + 0.5));
  return Math.sin(progress * Math.PI * 2.15 + phase) * amplitude
    + Math.sin(progress * Math.PI * 4.4 - phase * 0.45) * amplitude * 0.24;
}

function chooseTreeVariant(random: () => number, pineWeight: number, ancient: boolean): WoodlandTreeVariant {
  if (ancient && random() < 0.08) return "twisted-2";
  if (random() < pineWeight) {
    return (["pine-1", "pine-3", "pine-5"] as const)[Math.floor(random() * 3)]!;
  }
  return (["broadleaf-1", "broadleaf-3", "broadleaf-5"] as const)[Math.floor(random() * 3)]!;
}

function densityMultiplier(density: GhibliWoodlandInput["dressingDensity"]): number {
  if (density === "sparse") return 0.68;
  if (density === "rich") return 1.22;
  return 1;
}

/**
 * Compiles novel-derived woodland semantics into presentation-only dressing.
 * The same input always produces the same layout, and no narrative entities are minted.
 */
export function compileGhibliWoodlandLayout(input: GhibliWoodlandInput): GhibliWoodlandLayout {
  const text = semanticText(input);
  const seed = stableWoodlandSeed([
    input.locationId,
    input.archetype,
    input.visualDescription,
    input.mood,
    input.timeOfDay,
    [...input.architectureTags].sort().join(","),
    [...input.dressingTags].sort().join(","),
  ].join("|"));
  const random = randomFromSeed(seed);
  const mood = resolveWoodlandMood(text);
  const density = densityMultiplier(input.dressingDensity);
  const qualityScale = input.quality === "low" ? 0.58 : input.quality === "high" ? 1.22 : 1;
  const treeCount = Math.round(34 * density * qualityScale);
  const coverCount = Math.round(88 * density * qualityScale);
  const pathPhase = random() * Math.PI * 2;
  const pathAmplitude = input.bounds[0] * (0.055 + random() * 0.045);
  const pathWidth = Math.max(2.25, Math.min(3.4, input.bounds[0] * 0.066));
  const pineWeight = /\b(?:pine|conifer|fir|spruce|cedar)\w*\b/.test(text)
    ? 0.72
    : /\b(?:grove|broadleaf|deciduous|oak|flower)\w*\b/.test(text)
      ? 0.05
      : 0.43;
  const ancient = /\b(?:gnarled|primeval|twisted)\w*\b/.test(text);
  const flowerWeight = /\b(?:flower|spring|sunlit|glade|grove|meadow)\w*\b/.test(text) ? 0.38 : 0.16;
  const mushroomWeight = /\b(?:mushroom|fungi|toadstool|mist|rain|damp)\w*\b/.test(text) ? 0.2 : 0.07;

  const trees: GhibliWoodlandLayout["trees"] = [];
  const framingTrees = [
    { side: -1, z: input.bounds[2] * 0.05, distance: 5.3 },
    { side: 1, z: 0, distance: 5.7 },
    { side: -1, z: -input.bounds[2] * 0.16, distance: 4.1 },
    { side: 1, z: -input.bounds[2] * 0.21, distance: 4.35 },
  ] as const;
  framingTrees.slice(0, Math.min(framingTrees.length, treeCount)).forEach((frame, index) => {
    const height = 9.4 + random() * 3.2;
    const center = woodlandPathCenter(frame.z, input.bounds, pathPhase, pathAmplitude);
    trees.push({
      variant: index < 2 && ancient ? "twisted-2" : chooseTreeVariant(random, pineWeight, ancient),
      position: [
        center + frame.side * (pathWidth + frame.distance + random() * 1.2),
        height / 2 - 0.03,
        frame.z,
      ],
      rotationY: random() * Math.PI * 2,
      scale: [height * (0.34 + random() * 0.08), height, height * (0.31 + random() * 0.1)],
      foreground: true,
    });
  });
  let treeAttempts = 0;
  while (trees.length < treeCount && treeAttempts < treeCount * 12) {
    treeAttempts += 1;
    const z = -input.bounds[2] * 0.58 + random() * input.bounds[2] * 0.8;
    const center = woodlandPathCenter(z, input.bounds, pathPhase, pathAmplitude);
    const side = random() < 0.5 ? -1 : 1;
    const near = random() < 0.42;
    const corridor = pathWidth + (near ? 1.4 : 3.2) + random() * (near ? 5.2 : input.bounds[0] * 0.44);
    const x = center + side * corridor;
    if (Math.abs(x) > input.bounds[0] * 0.78) continue;
    // Keep the default human-level arrival view readable. Trees can frame the
    // entrance, but random scatter may not put a trunk directly in front of it.
    if (z > input.bounds[2] * 0.08 && Math.abs(x) < input.bounds[0] * 0.42) continue;
    const height = near ? 6.3 + random() * 4.8 : 8.4 + random() * 5.8;
    const width = height * (0.3 + random() * 0.13);
    trees.push({
      variant: chooseTreeVariant(random, pineWeight, ancient),
      position: [x, height / 2 - 0.03, z],
      rotationY: random() * Math.PI * 2,
      scale: [width, height, width * (0.84 + random() * 0.28)],
      foreground: near && Math.abs(z) < input.bounds[2] * 0.52,
    });
  }

  const groundCover: GhibliWoodlandLayout["groundCover"] = [];
  const foregroundVariants: WoodlandGroundVariant[] = [
    "fern",
    flowerWeight > 0.25 ? "flower-bush" : "wispy-grass",
    mushroomWeight > 0.12 ? "mushrooms" : "flowers",
    "fern",
    "rock-2",
    flowerWeight > 0.25 ? "flowers" : "wispy-grass",
  ];
  foregroundVariants.slice(0, Math.min(foregroundVariants.length, coverCount)).forEach((variant, index) => {
    const z = input.bounds[2] * (0.35 - index * 0.045);
    const side = index % 2 === 0 ? -1 : 1;
    const center = woodlandPathCenter(z, input.bounds, pathPhase, pathAmplitude);
    const base = variant.startsWith("rock") ? 0.92 : variant === "mushrooms" ? 0.78 : 1.26;
    groundCover.push({
      variant,
      position: [center + side * (pathWidth + 1.05 + (index % 3) * 0.55), base * 0.38, z],
      rotationY: random() * Math.PI * 2,
      scale: [base * (0.9 + random() * 0.3), base * 0.76, base * (0.9 + random() * 0.3)],
      foreground: true,
    });
  });
  for (let index = groundCover.length; index < coverCount; index += 1) {
    const z = (random() - 0.5) * input.bounds[2] * 1.18;
    const center = woodlandPathCenter(z, input.bounds, pathPhase, pathAmplitude);
    const side = random() < 0.5 ? -1 : 1;
    const x = center + side * (pathWidth + 0.55 + random() * input.bounds[0] * 0.36);
    const choice = random();
    let variant: WoodlandGroundVariant;
    if (choice < flowerWeight * 0.35) variant = "flower-bush";
    else if (choice < flowerWeight) variant = "flowers";
    else if (choice < flowerWeight + mushroomWeight) variant = "mushrooms";
    else if (choice < flowerWeight + mushroomWeight + 0.2) variant = "fern";
    else if (choice < flowerWeight + mushroomWeight + 0.62) variant = "wispy-grass";
    else variant = (["rock-1", "rock-2", "rock-3"] as const)[Math.floor(random() * 3)]!;
    const base = variant.startsWith("rock")
      ? 0.42 + random() * 0.52
      : variant === "flower-bush"
        ? 0.88 + random() * 0.62
        : variant === "fern"
          ? 0.68 + random() * 0.54
          : variant === "mushrooms"
            ? 0.52 + random() * 0.36
            : 0.56 + random() * 0.48;
    const heightFactor = variant === "fern" ? 0.82 : variant === "flower-bush" ? 0.92 : 0.68;
    groundCover.push({
      variant,
      position: [x, base * heightFactor / 2, z],
      rotationY: random() * Math.PI * 2,
      scale: [base * (0.8 + random() * 0.5), base * heightFactor, base * (0.8 + random() * 0.5)],
      foreground: Math.abs(z) < input.bounds[2] * 0.42 && Math.abs(x) < input.bounds[0] * 0.46,
    });
  }

  return { seed, mood, pathPhase, pathAmplitude, pathWidth, trees, groundCover };
}
