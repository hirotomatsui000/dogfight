/**
 * How much larger to draw an object so it never looks smaller than `minAngleRad` (spec §15.4, revision 5): real
 * size up close, then growing with distance, up to `maxScale`. Rendering only; hit detection uses the real size.
 */
export function visibilityScale(distanceM: number, sizeM: number, minAngleRad: number, maxScale: number): number {
  const needed = (distanceM * Math.tan(minAngleRad)) / sizeM;
  return Math.min(maxScale, Math.max(1, needed));
}
