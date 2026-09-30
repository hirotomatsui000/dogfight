import type { Vector3 } from 'three';
import { G0 } from '../math/units.ts';
import { muzzleTime } from './ballistics.ts';

/**
 * Direction to fire so a projectile meets a target flying at constant velocity (spec §10.1).
 * It iterates the time of flight t: aim = normalize(Δp + Δv·t + ½g·t²·ŷ). Used by the HUD lead marker and by bots.
 * Returns the time of flight in seconds and writes the unit aim direction to `out`.
 */
export function leadDirection(
  shooterPos: Vector3,
  shooterVel: Vector3,
  targetPos: Vector3,
  targetVel: Vector3,
  muzzleSpeed: number,
  drag: number,
  out: Vector3,
  iterations = 3,
): number {
  const px = targetPos.x - shooterPos.x;
  const py = targetPos.y - shooterPos.y;
  const pz = targetPos.z - shooterPos.z;
  const vx = targetVel.x - shooterVel.x;
  const vy = targetVel.y - shooterVel.y;
  const vz = targetVel.z - shooterVel.z;
  let t = muzzleTime(muzzleSpeed, drag, Math.sqrt(px * px + py * py + pz * pz));
  for (let i = 0; i < iterations; i++) {
    out.set(px + vx * t, py + vy * t + 0.5 * G0 * t * t, pz + vz * t);
    t = muzzleTime(muzzleSpeed, drag, out.length());
  }
  out.set(px + vx * t, py + vy * t + 0.5 * G0 * t * t, pz + vz * t).normalize();
  return t;
}
