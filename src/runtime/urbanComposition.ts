/** Human-scale minimums shared by procedural city rendering and preflight. */
export const URBAN_HUMAN_SCALE = Object.freeze({
  minimumBuildingHeight: 7.2,
  doorHeight: 2.24,
  doorWidth: 0.98,
  windowSillHeight: 2.87,
  stallCounterHeight: 0.94,
  stallCanopyHeight: 2.42,
  balconyCenterProjection: 0.16,
  balconyDepth: 0.32,
  canalWaveAmplitude: 0.11,
  canalVolumeClearance: 0.018,
  canalWaterLevel: -0.31,
  canalBedTop: -0.58,
  canalCoverageRatio: 0.97,
  streetSurfaceTop: 0.068,
  sidewalkSurfaceTop: 0.19,
  facadeMaximumDepth: 3.96,
  horizonCenterFactor: 0.69,
  horizonApronDepthRatio: 0.5,
});

/** Horizontal footprint of the raised pedestrian slabs rendered on each side. */
export const URBAN_SIDEWALK_CENTER_FACTOR = 0.34;
export const URBAN_SIDEWALK_WIDTH_FACTOR = 0.22;

/**
 * Resolves the real rendered support plane at an urban X coordinate. Props in
 * the side bands rest on the raised sidewalk; props elsewhere rest on the
 * lower street. Keeping this calculation shared prevents renderer/placement
 * drift when a collision reroute crosses between surface bands.
 */
export function urbanWalkableSurfaceTop(boundsWidth: number, x: number): number {
  const sidewalkCenter = boundsWidth * URBAN_SIDEWALK_CENTER_FACTOR;
  const sidewalkHalfWidth = boundsWidth * URBAN_SIDEWALK_WIDTH_FACTOR / 2;
  return Math.abs(Math.abs(x) - sidewalkCenter) <= sidewalkHalfWidth
    ? URBAN_HUMAN_SCALE.sidewalkSurfaceTop
    : URBAN_HUMAN_SCALE.streetSurfaceTop;
}
