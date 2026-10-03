import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { kestrel } from '../data/aircraft/kestrel.ts';
import { DEG, RAD } from '../math/units.ts';
import { neutralInput } from '../physics/controls.ts';
import { createFlightState, type FlightState, stepFlight } from '../physics/flight-model.ts';
import { sentinelFor } from '../data/aircraft/registry.ts';
import { steerLevel, steerToward } from './steering.ts';

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

describe('steerToward (how the turn feels)', () => {
  /** Bank angle, + = right wing down. */
  const bankOf = (s: FlightState) => {
    const fwd = new Vector3(0, 0, -1).applyQuaternion(s.quat);
    const up = new Vector3(0, 1, 0).applyQuaternion(s.quat);
    const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize();
    const levelUp = new Vector3().crossVectors(right, fwd);
    return Math.atan2(up.dot(right), up.dot(levelUp)) * RAD;
  };
  const fly = (target: Vector3, seconds: number, onStep: (s: FlightState) => void) => {
    const s = createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 230, throttle: 0.9 });
    const steer = { pitch: 0, roll: 0, yaw: 0 };
    for (let i = 0; i < seconds * 60; i++) {
      steerToward(s, target, {}, steer);
      stepFlight(s, { ...neutralInput(0.9), ...steer }, kestrel.physics, 1 / 60);
      onStep(s);
    }
    return s;
  };

  it('rolls into a hard turn without overshooting its bank', () => {
    let peak = 0;
    fly(dirFrom(90, 0), 3, (st) => (peak = Math.max(peak, bankOf(st))));
    // Rolling the target into the lift plane needs 90 degrees; the old undamped autopilot swung to 109.
    expect(peak).toBeLessThan(100);
  });

  it('still makes a small correction quickly', () => {
    let reached = -1;
    let t = 0;
    fly(dirFrom(12, 0), 4, (st) => {
      t += 1 / 60;
      if (reached < 0 && new Vector3(0, 0, -1).applyQuaternion(st.quat).angleTo(dirFrom(12, 0)) * RAD < 3) reached = t;
    });
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThan(2.5);
  });
});

describe('steerLevel (revision 19)', () => {
  const sentinel = sentinelFor('usa').physics;
  const opts = { maxBankRad: 40 * DEG, gMax: sentinel.gMax, gMin: sentinel.gMin };
  const out = () => ({ pitch: 0, roll: 0, yaw: 0 });

  it('turns a heavy aircraft round without passing its bank limit or losing height', () => {
    const s = createFlightState({ position: new Vector3(0, 7000, 0), headingRad: 0, speed: 180, throttle: 0.9 });
    const input = neutralInput(0.9);
    const steer = out();
    const up = new Vector3();
    let maxBank = 0;
    for (let t = 0; t < 120 * 60; t++) {
      steerLevel(s, Math.PI, 0, opts, steer);
      input.pitch = steer.pitch;
      input.roll = steer.roll;
      input.yaw = steer.yaw;
      stepFlight(s, input, sentinel, 1 / 60);
      up.set(0, 1, 0).applyQuaternion(s.quat);
      maxBank = Math.max(maxBank, Math.acos(Math.min(1, up.y)));
      expect(Math.abs(s.pos.y - 7000)).toBeLessThan(400);
    }
    expect(maxBank).toBeLessThan(45 * DEG);
    // Heading south now.
    expect(Math.abs(Math.atan2(s.vel.x, -s.vel.z)) * RAD).toBeGreaterThan(170);
  });

  it('levels the wings before pulling when banked past 75°', () => {
    const s = northbound();
    s.quat.setFromEuler(new Euler(0, 0, -80 * DEG, 'YXZ'));
    const o = steerLevel(s, 0, 0, opts, out());
    expect(o.pitch).toBe(0);
    expect(Math.abs(o.roll)).toBeGreaterThan(0.5);
  });
});
