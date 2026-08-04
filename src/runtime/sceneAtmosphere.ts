import type { Vector3Tuple } from "../contracts/world";
import type { ScenePresentation } from "./sceneCompiler";

export type SceneEnvironmentFamily =
  | "interior"
  | "industrial"
  | "glasshouse"
  | "courtyard"
  | "urban"
  | "woodland"
  | "alpine"
  | "arid"
  | "coastal"
  | "grassland";

export interface SceneAtmosphereProfile {
  family: SceneEnvironmentFamily;
  openAir: boolean;
  night: boolean;
  sky: {
    topColor: string;
    horizonColor: string;
    cloudColor: string;
    cloudiness: number;
  };
  fogNear: number;
  fogFar: number;
  hemisphereIntensity: number;
  ambientScale: number;
  keyPosition: Vector3Tuple;
  keyScale: number;
  fillPosition: Vector3Tuple;
  fillIntensity: number;
  environmentIntensity: number;
  exposure: number;
  contactShadow: {
    opacity: number;
    blur: number;
    far: number;
    scale: number;
  };
}

export function sceneEnvironmentFamily(
  presentation: ScenePresentation,
): SceneEnvironmentFamily {
  if (presentation.architecture.industrialShell) return "industrial";
  if (presentation.architecture.woodlandEdge || presentation.architecture.forestFloor) {
    if (presentation.architecture.alpineTerrain) return "alpine";
    return "woodland";
  }
  if (presentation.architecture.glasshousePanels) return "glasshouse";
  if (presentation.architecture.urbanStreet) return "urban";
  if (presentation.architecture.alpineTerrain) return "alpine";
  if (presentation.architecture.aridTerrain) return "arid";
  if (presentation.architecture.coastalTerrain) return "coastal";
  if (presentation.architecture.grassland) return "grassland";
  if (presentation.architecture.openAir) return "courtyard";
  return "interior";
}

/**
 * Turns Part 1's time, palette and lighting intent into one bounded renderer rig.
 * The values are deliberately deterministic so the same scene plan always
 * produces the same atmosphere on every client.
 */
export function createSceneAtmosphereProfile(
  presentation: ScenePresentation,
  bounds: Vector3Tuple,
): SceneAtmosphereProfile {
  const family = sceneEnvironmentFamily(presentation);
  const openAir = ["courtyard", "urban", "woodland", "alpine", "arid", "coastal", "grassland"].includes(family);
  const night = /\b(?:night|moon|midnight|dusk|blue-hour)\b/i.test(
    presentation.location.timeOfDay,
  );
  const rainy = presentation.atmosphere.rain;
  const span = Math.max(bounds[0], bounds[2]);
  const highContrast = presentation.location.lighting.contrast === "high";

  const fogNearFactor = family === "woodland" ? 0.3 : family === "coastal" ? 0.38 : family === "courtyard" || family === "urban" ? 0.42 : 0.46;
  const fogFarFactor = family === "woodland" ? 1.62 : family === "coastal" ? 2.35 : family === "arid" ? 2.6 : family === "courtyard" || family === "urban" ? 2.05 : 1.9;
  const ambientScale = family === "glasshouse" ? 0.72 : openAir ? 0.82 : 1;
  const hemisphereIntensity =
    family === "glasshouse" ? 0.48
      : family === "woodland" ? 0.62
        : family === "alpine" ? 0.88
          : family === "arid" ? 0.82
            : openAir ? 0.68
              : family === "industrial" ? 0.58
                : highContrast ? 0.78 : 0.95;
  const keyPosition: Vector3Tuple =
    family === "glasshouse"
      ? [3.8, 8.5, -3.4]
      : family === "woodland" || family === "alpine"
        ? [-6.5, 10.5, -4]
        : family === "coastal"
          ? [-8, 9, -3]
          : family === "arid"
            ? [7, 11, 3]
        : family === "courtyard"
          ? [-4.5, 8, 2.5]
          : [5, 8, 4];
  const fillPosition: Vector3Tuple = [-keyPosition[0] * 0.72, bounds[1] * 0.82, -keyPosition[2] * 0.72];

  return {
    family,
    openAir,
    night,
    sky: {
      topColor: rainy ? "#14242b" : night ? "#071a24" : family === "alpine" ? "#6f91a8" : family === "arid" ? "#567f9b" : family === "coastal" ? "#397a96" : presentation.palette.background,
      horizonColor: rainy ? "#53666a" : night ? "#21464c" : family === "alpine" ? "#d9e4e8" : family === "arid" ? "#e4b77d" : family === "coastal" ? "#a8d2d6" : presentation.palette.fog,
      cloudColor: rainy ? "#859397" : night ? "#36565c" : family === "arid" ? "#edd4ad" : "#d6dddc",
      cloudiness: rainy ? 0.9 : night ? 0.16 : family === "woodland" ? 0.24 : family === "arid" ? 0.08 : family === "coastal" ? 0.42 : 0.3,
    },
    fogNear: Math.max(openAir ? 8 : 10, span * fogNearFactor),
    fogFar: Math.max(openAir ? 27 : 29, span * fogFarFactor),
    hemisphereIntensity,
    ambientScale,
    keyPosition,
    keyScale: family === "woodland" ? 0.92 : family === "courtyard" || family === "urban" ? 0.84 : family === "arid" ? 1.08 : 1,
    fillPosition,
    fillIntensity: presentation.location.lighting.keyIntensity * (night ? 0.16 : 0.11),
    environmentIntensity: (
      family === "glasshouse" ? 0.5 : family === "interior" ? 0.44 : family === "industrial" ? 0.34 : family === "courtyard" || family === "urban" ? 0.38 : family === "alpine" ? 0.42 : 0.32
    ) * (night ? 0.78 : 1) * (highContrast ? 0.9 : 1),
    exposure: night ? (highContrast ? 1.12 : 1.08) : rainy ? 1.03 : 1.08,
    contactShadow: {
      opacity: family === "woodland" ? 0.34 : family === "alpine" ? 0.28 : family === "courtyard" || family === "urban" ? 0.4 : 0.48,
      blur: family === "woodland" || family === "alpine" ? 3.2 : openAir ? 2.8 : 2.25,
      far: Math.max(5, bounds[1] * 1.35),
      scale: span * (openAir ? 1.55 : 1.08),
    },
  };
}
