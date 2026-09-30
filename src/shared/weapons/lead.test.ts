import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { closestApproach } from '../math/closest-approach.ts';
import { ballisticPosition } from './ballistics.ts';
import { leadDirection } from './lead.ts';

/** Flies a projectile along `dir` and returns its closest approach to the constant-velocity target. */
function missDistance(shooterPos: Vector3, shooterVel: Vector3, targetPos: Vector3, targetVel: Vector3, dir: Vector3, u: number, k: number) {
  const dt = 1 / 60;
  let best = Infinity;
  const p0 = shooterPos.clone();
  const p1 = new Vector3();
  const t0 = targetPos.clone();
  const t1 = new Vector3();
  for (let i = 1; i <= 180; i++) {
    ballisticPosition(shooterPos, shooterVel, dir, u, k, i * dt, p1);
    t1.copy(targetPos).addScaledVector(targetVel, i * dt);
    best = Math.min(best, closestApproach(p0, p1, t0, t1).distance);
    p0.copy(p1);
    t0.copy(t1);
  }
  return best;
}

describe('leadDirection', () => {
  const u = 1030;
  const k = 4e-4;

  it('hits a target crossing at 250 m/s, 800 m away', () => {
    const shooterPos = new Vector3(0, 3000, 0);
    const shooterVel = new Vector3(0, 0, -240);
    const targetPos = new Vector3(150, 3050, -780);
    const targetVel = new Vector3(250, 0, -60);
    const dir = new Vector3();
    const tof = leadDirection(shooterPos, shooterVel, targetPos, targetVel, u, k, dir);
    expect(tof).toBeGreaterThan(0.5);
    expect(tof).toBeLessThan(1.5);
    expect(missDistance(shooterPos, shooterVel, targetPos, targetVel, dir, u, k)).toBeLessThan(2);
  });

  it('hits a climbing, turning-away target at 1.5 km within the hit radius', () => {
    const shooterPos = new Vector3(0, 2000, 0);
    const shooterVel = new Vector3(40, 10, -260);
    const targetPos = new Vector3(-400, 2300, -1400);
    const targetVel = new Vector3(-180, 60, -150);
    const dir = new Vector3();
    leadDirection(shooterPos, shooterVel, targetPos, targetVel, 880, 3.2e-4, dir);
    expect(missDistance(shooterPos, shooterVel, targetPos, targetVel, dir, 880, 3.2e-4)).toBeLessThan(6);
  });

  it('aims slightly above a stationary target to allow for gravity', () => {
    const dir = new Vector3();
    leadDirection(new Vector3(0, 1000, 0), new Vector3(), new Vector3(0, 1000, -1000), new Vector3(), u, k, dir);
    expect(dir.y).toBeGreaterThan(0);
    expect(dir.z).toBeLessThan(-0.99);
  });
});
