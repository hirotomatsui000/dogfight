import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { steerToward } from '../ai/steering.ts';
import { kestrel } from '../data/aircraft/kestrel.ts';
import { SRM_DART } from '../data/weapons.ts';
import { closestApproach } from '../math/closest-approach.ts';
import { DEG, G0 } from '../math/units.ts';
import { atmosphere } from '../physics/atmosphere.ts';
import { neutralInput } from '../physics/controls.ts';
import { createFlightState, stepFlight } from '../physics/flight-model.ts';
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
    expect(r.maxLateral).toBeGreaterThan(0.9 * SRM_DART.maxAccelG * G0);
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

/**
 * A Kestrel flying north at 250 m/s, 3 km up, shot at from `rangeM` ahead (head-on) or behind (tail). With `breakAtM`
 * it turns hard to put the missile on its wingline once the missile is that close, as the HUD and the bots do.
 * Returns the closest the missile came, or 0 when its fuze fired.
 */
function evade(aspect: 'head-on' | 'tail', rangeM: number, breakAtM: number | null): number {
  const jet = createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 250, throttle: 0.85 });
  const from = new Vector3(0, 3000, aspect === 'head-on' ? -rangeM : rangeM);
  const launcher = {
    id: 1,
    team: 'russia' as const,
    flight: createFlightState({ position: from, headingRad: aspect === 'head-on' ? Math.PI : 0, speed: 250 }),
  };
  const m = launchMissile(7, launcher, 2, SRM_DART);
  const jetPrev = new Vector3();
  const side = new Vector3();
  const up = new Vector3(0, 1, 0);
  const steer = { pitch: 0, roll: 0, yaw: 0 };
  let tracking = true;
  let breaking = false;
  let miss = Infinity;
  for (let i = 0; i < 25 * 60 && !isSpent(m); i++) {
    breaking ||= breakAtM !== null && m.pos.distanceTo(jet.pos) < breakAtM;
    const input = neutralInput(0.85);
    if (breaking) {
      side.subVectors(m.pos, jet.pos).cross(up).normalize();
      if (side.dot(jet.vel) < 0) side.negate();
      Object.assign(input, steerToward(jet, side, {}, steer));
    }
    jetPrev.copy(jet.pos);
    stepFlight(jet, input, kestrel.physics, DT);
    tracking &&= withinGimbal(m, jet.pos);
    stepMissile(m, tracking ? jet : null, atmosphere(m.pos.y).density, DT);
    if (!isArmed(m)) continue;
    miss = Math.min(miss, closestApproach(m.prevPos, m.pos, jetPrev, jet.pos).distance);
    if (miss <= SRM_DART.fuzeRadiusM) return 0;
  }
  return miss;
}

describe('beating a missile by maneuvering', () => {
  it('hits a jet that keeps flying straight', () => {
    expect(evade('head-on', 2500, null)).toBe(0);
  });

  it('misses a jet that breaks hard shortly before impact', () => {
    expect(evade('head-on', 2500, 1500)).toBeGreaterThan(SRM_DART.fuzeRadiusM);
  });

  it('still hits a jet that breaks at launch: the missile has time to correct', () => {
    expect(evade('head-on', 4000, 4000)).toBe(0);
  });

  it('still hits a jet that breaks too late', () => {
    expect(evade('head-on', 2500, 500)).toBe(0);
  });

  it('misses a jet that breaks late in a tail chase', () => {
    expect(evade('tail', 3000, 700)).toBeGreaterThan(SRM_DART.fuzeRadiusM);
  });
});
