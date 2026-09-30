import type { Vector3 } from 'three';
import { clamp } from './units.ts';

export interface Approach {
  /** smallest distance between the two points during the interval */
  distance: number;
  /** 0..1: when during the interval the closest approach happens */
  fraction: number;
}

/**
 * Closest approach of two points moving in straight lines over the same interval (a0 -> a1 and b0 -> b1).
 * Exact for linear motion, so fast movers cannot tunnel through each other between ticks.
 */
export function closestApproach(
  a0: Vector3,
  a1: Vector3,
  b0: Vector3,
  b1: Vector3,
  out: Approach = { distance: 0, fraction: 0 },
): Approach {
  const rx = a0.x - b0.x;
  const ry = a0.y - b0.y;
  const rz = a0.z - b0.z;
  const dx = a1.x - a0.x - (b1.x - b0.x);
  const dy = a1.y - a0.y - (b1.y - b0.y);
  const dz = a1.z - a0.z - (b1.z - b0.z);
  const dd = dx * dx + dy * dy + dz * dz;
  const s = dd > 1e-12 ? clamp(-(rx * dx + ry * dy + rz * dz) / dd, 0, 1) : 0;
  const cx = rx + s * dx;
  const cy = ry + s * dy;
  const cz = rz + s * dz;
  out.distance = Math.sqrt(cx * cx + cy * cy + cz * cz);
  out.fraction = s;
  return out;
}
