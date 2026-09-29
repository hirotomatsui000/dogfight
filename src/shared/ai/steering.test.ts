import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { kestrel } from '../data/aircraft/kestrel.ts';
import { DEG, RAD } from '../math/units.ts';
import { neutralInput } from '../physics/controls.ts';
import { createFlightState, stepFlight } from '../physics/flight-model.ts';
import { steerToward } from './steering.ts';

const northbound = () => createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 200, throttle: 1 });
const dirFrom = (headingDeg: number, elevationDeg: number) => {
  const h = headingDeg * DEG;
  const e = elevationDeg * DEG;
  return new Vector3(Math.sin(h) * Math.cos(e), Math.sin(e), -Math.cos(h) * Math.cos(e));
};

describe('steerToward (open loop)', () => {
  it('rolls toward a target on the right or left', () => {
    expect(steerToward(northbound(), dirFrom(90, 0)).roll).toBeGreaterThan(0.5);
    expect(steerToward(northbound(), dirFrom(-90, 0)).roll).toBeLessThan(-0.5);
  });
  it('pulls toward a target above the nose without rolling', () => {
    const out = steerToward(northbound(), dirFrom(0, 20));
    expect(out.pitch).toBeGreaterThan(0.5);
    expect(Math.abs(out.roll)).toBeLessThan(0.05);
  });
  it('levels the wings when the target is on the nose', () => {
    const s = northbound();
    s.quat.multiply(new Quaternion().setFromEuler(new Euler(0, 0, -30 * DEG)));
    expect(steerToward(s, dirFrom(0, 0)).roll).toBeLessThan(-0.3);
  });
  it('uses rudder for small horizontal corrections', () => {
    expect(steerToward(northbound(), dirFrom(2, 0)).yaw).toBeGreaterThan(0.1);
  });
  it('honours maxPull', () => {
    expect(steerToward(northbound(), dirFrom(0, 60), { maxPull: 0.5 }).pitch).toBeLessThanOrEqual(0.5);
  });
});

describe('steerToward (closed loop with the flight model)', () => {
  const converge = (target: Vector3, seconds: number) => {
    const s = northbound();
    const steer = { pitch: 0, roll: 0, yaw: 0 };
    for (let i = 0; i < seconds * 60; i++) {
      steerToward(s, target, {}, steer);
      stepFlight(s, { ...neutralInput(1), ...steer }, kestrel.physics, 1 / 60);
    }
    return new Vector3(0, 0, -1).applyQuaternion(s.quat).angleTo(target) * RAD;
  };
  it('turns 120 degrees right and settles within 3 degrees', () => {
    expect(converge(dirFrom(120, 10), 12)).toBeLessThan(3);
  });
  it('reverses toward a target behind and below', () => {
    expect(converge(dirFrom(-170, -20), 15)).toBeLessThan(3);
  });
});
