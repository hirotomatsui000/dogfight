import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SRM_DART } from '../data/weapons.ts';
import { closestApproach } from '../math/closest-approach.ts';
import { DEG, G0 } from '../math/units.ts';
import { atmosphere } from '../physics/atmosphere.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { isArmed, isSpent, launchMissile, stepMissile, withinGimbal } from './missile.ts';

const DT = 1 / 60;

/** Launches from a jet heading north at 250 m/s, 3 km up, against a constant-velocity target. */
function engage(targetPos: Vector3, targetVel: Vector3) {
  const launcher = { id: 1, team: 'usa' as const, flight: createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 250 }) };
  const m = launchMissile(7, launcher, 2, SRM_DART);
  const tPrev = targetPos.clone();
  const tPos = targetPos.clone();
  let miss = Infinity;
  let maxLateral = 0;
  let steps = 0;
  while (!isSpent(m) && steps < 60 * 30) {
    tPrev.copy(tPos);
    tPos.addScaledVector(targetVel, DT);
    stepMissile(m, { pos: tPos, vel: targetVel }, atmosphere(m.pos.y).density, DT);
    maxLateral = Math.max(maxLateral, m.lateralAccel);
    miss = Math.min(miss, closestApproach(m.prevPos, m.pos, tPrev, tPos).distance);
    steps++;
    if (miss < SRM_DART.fuzeRadiusM) break;
  }
  return { m, miss, maxLateral, timeS: steps * DT };
}

describe('missile', () => {
  it('launches along the nose at the launcher speed', () => {
    const launcher = { id: 1, team: 'usa' as const, flight: createFlightState({ position: new Vector3(0, 3000, 0), headingRad: Math.PI / 2, speed: 240 }) };
    const m = launchMissile(3, launcher, 9, SRM_DART);
    expect(m.vel.x).toBeCloseTo(240, 6);
    expect(m.targetId).toBe(9);
    expect(isArmed(m)).toBe(false);
  });

  it('proportional navigation hits a target crossing at 4 km', () => {
    const r = engage(new Vector3(-1500, 3000, -4000), new Vector3(250, 0, 0));
    expect(r.miss).toBeLessThan(SRM_DART.fuzeRadiusM);
    expect(r.timeS).toBeLessThan(10);
  });

  it('hits a head-on target at 7 km', () => {
    const r = engage(new Vector3(300, 3500, -7000), new Vector3(0, 0, 250));
    expect(r.miss).toBeLessThan(SRM_DART.fuzeRadiusM);
  });

  it('runs out of energy chasing a fleeing target from 10 km', () => {
    const r = engage(new Vector3(0, 3000, -10000), new Vector3(0, 0, -300));
    expect(r.miss).toBeGreaterThan(100);
    expect(isSpent(r.m)).toBe(true);
  });

  it('never turns harder than its acceleration limit', () => {
    const r = engage(new Vector3(1500, 3000, -300), new Vector3(0, 0, 250));
    expect(r.maxLateral).toBeLessThanOrEqual(SRM_DART.maxAccelG * G0 + 1e-6);
    expect(r.maxLateral).toBeGreaterThan(20 * G0);
  });

  it('loses sight of a target outside its gimbal limit', () => {
    const launcher = { id: 1, team: 'usa' as const, flight: createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 250 }) };
    const m = launchMissile(3, launcher, 9, SRM_DART);
    expect(withinGimbal(m, new Vector3(0, 3000, -1000))).toBe(true);
    const off = Math.tan((SRM_DART.gimbalLimitDeg + 5) * DEG) * 1000;
    expect(withinGimbal(m, new Vector3(off, 3000, -1000))).toBe(false);
  });

  it('self-destructs when slow after burnout', () => {
    const launcher = { id: 1, team: 'usa' as const, flight: createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 250 }) };
    const m = launchMissile(3, launcher, 9, SRM_DART);
    m.ageS = SRM_DART.burnTimeS + 1;
    m.vel.setLength(SRM_DART.selfDestructSpeedMs - 1);
    expect(isSpent(m)).toBe(true);
  });
});
