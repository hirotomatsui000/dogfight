import type { Vector3 } from 'three';
import { G0 } from '../math/units.ts';

/**
 * Cannon projectile flight with gravity and simple drag. The muzzle-velocity component decays as
 * u / (1 + k·u·t) while the velocity inherited from the shooter is kept, which gives closed-form positions.
 * The lead solution (lead.ts) therefore matches the simulated path exactly.
 */

/** Distance covered by the muzzle-velocity component after `t` seconds. */
export function muzzleDistance(u: number, k: number, t: number): number {
  return k > 0 ? Math.log1p(k * u * t) / k : u * t;
}

/** Time the muzzle-velocity component needs to cover `distance` (inverse of muzzleDistance). */
export function muzzleTime(u: number, k: number, distance: number): number {
  return k > 0 ? Math.expm1(k * distance) / (k * u) : distance / u;
}

export function ballisticPosition(
  origin: Vector3,
  inherited: Vector3,
  dir: Vector3,
  u: number,
  k: number,
  t: number,
  out: Vector3,
): Vector3 {
  out.copy(origin).addScaledVector(inherited, t).addScaledVector(dir, muzzleDistance(u, k, t));
  out.y -= 0.5 * G0 * t * t;
  return out;
}

export function ballisticVelocity(inherited: Vector3, dir: Vector3, u: number, k: number, t: number, out: Vector3): Vector3 {
  out.copy(inherited).addScaledVector(dir, u / (1 + k * u * t));
  out.y -= G0 * t;
  return out;
}
