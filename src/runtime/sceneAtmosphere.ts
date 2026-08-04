import type { Vector3Tuple } from "../contracts/world";
import type { ScenePresentation } from "./sceneCompiler";

export type SceneEnvironmentFamily = "interior" | "glasshouse" | "courtyard" | "woodland";

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
  if (presentation.architecture.woodlandEdge || presentation.architecture.forestFloor) {
    return "woodland";
  }
  if (presentation.architecture.glasshousePanels) return "glasshouse";
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
  const openAir = family === "courtyard" || family === "woodland";
  const night = /\b(?:night|moon|midnight|dusk|blue-hour)\b/i.test(
    presentation.location.timeOfDay,
  );
  const rainy = presentation.atmosphere.rain;
  const span = Math.max(bounds[0], bounds[2]);
  const highContrast = presentation.location.lighting.contrast === "high";

  const fogNearFactor = family === "woodland" ? 0.3 : family === "courtyard" ? 0.42 : 0.46;
  const fogFarFactor = family === "woodland" ? 1.62 : family === "courtyard" ? 2.05 : 1.72;
  const ambientScale = family === "glasshouse" ? 0.72 : openAir ? 0.82 : 1;
  const hemisphereIntensity =
    family === "glasshouse" ? 0.48 : family === "woodland" ? 0.62 : family === "courtyard" ? 0.68 : highContrast ? 0.78 : 0.95;
  const keyPosition: Vector3Tuple =
    family === "glasshouse"
      ? [3.8, 8.5, -3.4]
      : family === "woodland"
        ? [-6.5, 10.5, -4]
        : family === "courtyard"
          ? [-4.5, 8, 2.5]
          : [5, 8, 4];
  const fillPosition: Vector3Tuple = [-keyPosition[0] * 0.72, bounds[1] * 0.82, -keyPosition[2] * 0.72];

  return {
    family,
    openAir,
    night,
    sky: {
      topColor: rainy ? "#14242b" : night ? "#071a24" : presentation.palette.background,
      horizonColor: rainy ? "#53666a" : night ? "#21464c" : presentation.palette.fog,
      cloudColor: rainy ? "#859397" : night ? "#36565c" : "#d6dddc",
      cloudiness: rainy ? 0.9 : night ? 0.16 : family === "woodland" ? 0.24 : 0.3,
    },
    fogNear: Math.max(openAir ? 8 : 10, span * fogNearFactor),
    fogFar: Math.max(openAir ? 27 : 29, span * fogFarFactor),
    hemisphereIntensity,
    ambientScale,
    keyPosition,
    keyScale: family === "woodland" ? 0.92 : family === "courtyard" ? 0.84 : 1,
    fillPosition,
    fillIntensity: presentation.location.lighting.keyIntensity * (night ? 0.16 : 0.11),
    environmentIntensity: (
      family === "glasshouse" ? 0.5 : family === "interior" ? 0.44 : family === "courtyard" ? 0.38 : 0.32
    ) * (night ? 0.78 : 1) * (highContrast ? 0.9 : 1),
    exposure: night ? (highContrast ? 1.12 : 1.08) : rainy ? 1.03 : 1.08,
    contactShadow: {
      opacity: family === "woodland" ? 0.34 : family === "courtyard" ? 0.4 : 0.48,
      blur: family === "woodland" ? 3.2 : openAir ? 2.8 : 2.25,
      far: Math.max(5, bounds[1] * 1.35),
      scale: span * (openAir ? 1.55 : 1.08),
    },
  };
}
