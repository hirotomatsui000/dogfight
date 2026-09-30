import type { Vector3 } from 'three';

export interface EdgeMarker {
  x: number;
  y: number;
  /** screen angle of the arrow, radians (0 = right, + = clockwise) */
  angle: number;
}

/**
 * Where to put an arrow for something off screen: on a rectangle `margin` pixels inside the screen edges, in the
 * direction (dirX, dirY) from the center (screen axes: x right, y down).
 */
export function edgeMarker(dirX: number, dirY: number, width: number, height: number, margin: number, out: EdgeMarker): EdgeMarker {
  const cx = width / 2;
  const cy = height / 2;
  const len = Math.hypot(dirX, dirY) || 1;
  const dx = dirX / len;
  const dy = dirY / len;
  const sx = Math.abs(dx) > 1e-9 ? (cx - margin) / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 1e-9 ? (cy - margin) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  out.x = cx + dx * s;
  out.y = cy + dy * s;
  out.angle = Math.atan2(dy, dx);
  return out;
}

/** Radar scope range scales (spec §15.2). */
export const SCOPE_SCALES_M: readonly number[] = [10000, 20000, 40000, 80000];

/** Smallest scale that shows `rangeM` with some room; 40 km with nothing to show. */
export function scopeScale(rangeM: number | null): number {
  if (rangeM === null) return 40000;
  for (const s of SCOPE_SCALES_M) if (rangeM * 1.15 <= s) return s;
  return SCOPE_SCALES_M[SCOPE_SCALES_M.length - 1];
}

/**
 * Heading-up radar scope position (pixels from the scope center, y down) of something `dx` east and `dz` south of
 * the observer. Returns false when it lies outside the scale.
 */
export function scopePoint(dx: number, dz: number, headingRad: number, scaleM: number, radiusPx: number, out: { x: number; y: number }): boolean {
  const ahead = dx * Math.sin(headingRad) - dz * Math.cos(headingRad);
  const right = dx * Math.cos(headingRad) + dz * Math.sin(headingRad);
  out.x = (right / scaleM) * radiusPx;
  out.y = (-ahead / scaleM) * radiusPx;
  return ahead * ahead + right * right <= scaleM * scaleM;
}

/** Rate at which the range to a target shrinks (m/s, + = closing). */
export function closureRate(myPos: Vector3, myVel: Vector3, targetPos: Vector3, targetVel: Vector3): number {
  const rx = targetPos.x - myPos.x;
  const ry = targetPos.y - myPos.y;
  const rz = targetPos.z - myPos.z;
  const range = Math.hypot(rx, ry, rz) || 1;
  return -((targetVel.x - myVel.x) * rx + (targetVel.y - myVel.y) * ry + (targetVel.z - myVel.z) * rz) / range;
}
