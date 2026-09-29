import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { listAircraft } from '../data/aircraft/registry.ts';
import type { AircraftConfig } from '../data/aircraft/types.ts';
import { Rng } from '../math/rng.ts';
import { DEG, G0, RAD } from '../math/units.ts';
import { stallSpeed, trimAlpha } from './aero.ts';
import { atmosphere } from './atmosphere.ts';
import { type ControlInput, neutralInput } from './controls.ts';
import { createFlightState, type FlightState, headingRad, stepFlight } from './flight-model.ts';

const DT = 1 / 60;
type InputFn = (t: number, s: FlightState) => Partial<ControlInput>;

function fly(s: FlightState, c: AircraftConfig, seconds: number, input: Partial<ControlInput> | InputFn, onStep?: (s: FlightState) => void) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const partial = typeof input === 'function' ? input(i * DT, s) : input;
    stepFlight(s, { ...neutralInput(s.throttle), ...partial }, c.physics, DT);
    onStep?.(s);
  }
}

const level = (speed: number, altitude: number, throttle: number) =>
  createFlightState({ position: new Vector3(0, altitude, 0), headingRad: 0, speed, throttle });

const energyHeight = (s: FlightState) => s.pos.y + (s.vel.lengthSq() / (2 * G0));

describe('createFlightState / headingRad', () => {
  it('points the nose and velocity along the heading', () => {
    const s = createFlightState({ position: new Vector3(0, 1000, 0), headingRad: Math.PI / 2, speed: 200 });
    expect(s.vel.x).toBeCloseTo(200, 6);
    expect(s.vel.z).toBeCloseTo(0, 6);
    expect(headingRad(s)).toBeCloseTo(Math.PI / 2, 6);
    expect(headingRad(level(200, 1000, 0.5))).toBeCloseTo(0, 6);
  });
});

describe.each(listAircraft().map((c) => [c.id, c] as const))('flight model: %s', (_id, c) => {
  const p = c.physics;

  it('holds altitude with a neutral stick', () => {
    const s = level(250, 5000, 0.75);
    fly(s, c, 10, {});
    expect(Math.abs(s.pos.y - 5000)).toBeLessThan(30);
  });

  it('holds altitude tightly when created trimmed (nose at the 1 G angle of attack)', () => {
    const alphaRad = trimAlpha(p, 250, atmosphere(5000).density);
    const s = createFlightState({ position: new Vector3(0, 5000, 0), headingRad: 0, speed: 250, throttle: 0.75, alphaRad });
    expect(s.vel.y).toBeCloseTo(0, 6);
    fly(s, c, 10, {});
    expect(Math.abs(s.pos.y - 5000)).toBeLessThan(5);
  });

  it('respects the G limit at high speed', () => {
    const s = level(300, 3000, 1);
    let maxG = 0;
    fly(s, c, 5, { pitch: 1, throttle: 1 }, (st) => (maxG = Math.max(maxG, st.gLoad)));
    expect(maxG).toBeGreaterThan(p.gMax - 1);
    expect(maxG).toBeLessThan(p.gMax + 0.5);
  });

  it('is lift-limited at low speed', () => {
    const s = level(120, 1000, 1);
    let maxG = 0;
    fly(s, c, 3, { pitch: 1, throttle: 1 }, (st) => (maxG = Math.max(maxG, st.gLoad)));
    expect(maxG).toBeLessThan(5);
  });

  it('stalls and sinks below stall speed', () => {
    const s = level(stallSpeed(p, 1.225) * 0.85, 1000, 0);
    let maxAlpha = 0;
    fly(s, c, 5, { throttle: 0 }, (st) => (maxAlpha = Math.max(maxAlpha, st.alpha)));
    expect(maxAlpha).toBeGreaterThanOrEqual(p.alphaMaxDeg * DEG);
    expect(1000 - s.pos.y).toBeGreaterThan(20);
  });

  it('meets its instantaneous turn-rate target at 170 m/s', () => {
    const s = level(170, 1000, 1);
    let best = 0;
    fly(s, c, 2, { pitch: 1, throttle: 1 }, (st) => {
      const rate = (G0 * Math.sqrt(Math.max(st.gLoad * st.gLoad - 1, 0))) / st.airspeed;
      best = Math.max(best, rate * RAD);
    });
    expect(best).toBeGreaterThan(c.performance.instantTurnDegS170[0]);
    expect(best).toBeLessThan(c.performance.instantTurnDegS170[1]);
  });

  it('bleeds energy in a hard turn', () => {
    const s = level(250, 1000, 0.9);
    const e0 = energyHeight(s);
    fly(s, c, 5, { pitch: 1, throttle: 0.9 });
    expect(e0 - energyHeight(s)).toBeGreaterThan(300);
  });

  it('trades speed for height in a zoom climb', () => {
    const s = createFlightState({ position: new Vector3(0, 1000, 0), headingRad: 0, pitchRad: 88 * DEG, speed: 300, throttle: 0 });
    let maxAlt = 0;
    fly(s, c, 60, { throttle: 0 }, (st) => (maxAlt = Math.max(maxAlt, st.pos.y)));
    expect(maxAlt - 1000).toBeGreaterThan(2000);
    expect(maxAlt - 1000).toBeLessThan(4600);
  });

  it('rolls quickly', () => {
    const s = level(200, 3000, 0.8);
    fly(s, c, 0.5, { roll: 1 });
    expect(s.angVel.length()).toBeGreaterThan(0.8 * p.maxRollRateDegS * DEG);
  });

  it('meets its top-speed target at 11 km', () => {
    const s = level(400, 11000, 1);
    fly(s, c, 300, { throttle: 1 });
    const mach = s.vel.length() / atmosphere(s.pos.y).speedOfSound;
    expect(mach).toBeGreaterThan(c.performance.topSpeedMach11km[0]);
    expect(mach).toBeLessThan(c.performance.topSpeedMach11km[1]);
  });

  it('meets its top-speed target near sea level', () => {
    const s = level(330, 300, 1);
    fly(s, c, 200, { throttle: 1 });
    const mach = s.vel.length() / atmosphere(s.pos.y).speedOfSound;
    expect(mach).toBeGreaterThan(c.performance.topSpeedMachSeaLevel[0]);
    expect(mach).toBeLessThan(c.performance.topSpeedMachSeaLevel[1]);
  });

  it('spools the engine with a 0.6 s time constant', () => {
    const s = level(250, 3000, 0.5);
    fly(s, c, 0.6, { throttle: 1 });
    expect(s.throttle).toBeCloseTo(0.5 + 0.5 * (1 - Math.exp(-1)), 2);
  });

  it('slows down faster with the airbrake', () => {
    const a = level(250, 3000, 0.9);
    const b = level(250, 3000, 0.9);
    fly(a, c, 10, { throttle: 0.9 });
    fly(b, c, 10, { throttle: 0.9, airbrake: true });
    expect(a.vel.length() - b.vel.length()).toBeGreaterThan(5);
  });

  const randomFlight = (seed: number) => {
    const rng = new Rng(seed);
    const s = level(250, 5000, 0.8);
    let current: Partial<ControlInput> = {};
    fly(s, c, 60, (t) => {
      if (Math.abs(t % 0.5) < DT / 2) {
        current = {
          pitch: rng.range(-1, 1),
          roll: rng.range(-1, 1),
          yaw: rng.range(-1, 1),
          throttle: rng.next(),
          airbrake: rng.next() < 0.2,
        };
      }
      return current;
    });
    return s;
  };

  it('never produces NaN under random inputs', () => {
    const s = randomFlight(1234);
    for (const v of [s.pos.x, s.pos.y, s.pos.z, s.vel.x, s.vel.y, s.vel.z, s.angVel.x, s.alpha, s.gLoad]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(s.quat.length()).toBeCloseTo(1, 6);
  });

  it('is deterministic', () => {
    const a = randomFlight(77);
    const b = randomFlight(77);
    expect(a.pos.toArray()).toEqual(b.pos.toArray());
    expect(a.quat.toArray()).toEqual(b.quat.toArray());
  });
});
