import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { listAircraft } from '../data/aircraft/registry.ts';
import type { AircraftConfig } from '../data/aircraft/types.ts';
import { Rng } from '../math/rng.ts';
import { DEG, G0, RAD } from '../math/units.ts';
import { stallSpeed, trimAlpha } from './aero.ts';
import { atmosphere } from './atmosphere.ts';
import { type ControlInput, neutralInput } from './controls.ts';
import { createFlightState, DEFAULT_FLIGHT_ENV, type FlightEnv, type FlightState, headingRad, stepFlight } from './flight-model.ts';
import { fuelFlowKgS } from './aero.ts';
import { getAircraft } from '../data/aircraft/registry.ts';

const DT = 1 / 60;
type InputFn = (t: number, s: FlightState) => Partial<ControlInput>;

function fly(
  s: FlightState,
  c: AircraftConfig,
  seconds: number,
  input: Partial<ControlInput> | InputFn,
  onStep?: (s: FlightState) => void,
  env: Readonly<FlightEnv> = DEFAULT_FLIGHT_ENV,
) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const partial = typeof input === 'function' ? input(i * DT, s) : input;
    stepFlight(s, { ...neutralInput(s.throttle), ...partial }, c.physics, DT, env);
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
    // Full lift at 120 m/s gives (v / stall speed)² G, well short of the G limit.
    const liftLimitG = (120 / stallSpeed(p, atmosphere(1000).density)) ** 2;
    expect(maxG).toBeLessThan(Math.min(p.gMax - 2, liftLimitG * 1.2));
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

  it('builds up its roll rate smoothly instead of snapping', () => {
    const s = level(200, 3000, 0.8);
    fly(s, c, 0.1, { roll: 1 });
    expect(s.angVel.length()).toBeLessThan(0.4 * p.maxRollRateDegS * DEG);
    fly(s, c, 0.7, { roll: 1 });
    expect(s.angVel.length()).toBeGreaterThan(0.8 * p.maxRollRateDegS * DEG);
  });

  it('takes 1.2 to 2 seconds to roll inverted with full stick', () => {
    const s = level(250, 3000, 0.8);
    const up = new Vector3();
    let t = 0;
    while (up.set(0, 1, 0).applyQuaternion(s.quat).y > Math.cos(170 * DEG) && t < 4) {
      fly(s, c, DT, { roll: 1 });
      t += DT;
    }
    expect(t).toBeGreaterThan(1.2);
    expect(t).toBeLessThan(2);
  });

  it('starts a pull smoothly', () => {
    const s = level(250, 3000, 0.8);
    fly(s, c, 0.05, { pitch: 1 });
    // Thrust vectoring raises the pitch-rate limit by up to (1 + thrustVectoring).
    expect(s.angVel.x).toBeLessThan(0.4 * p.maxPitchRateDegS * DEG * (1 + p.thrustVectoring));
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

const envWith = (wind: Vector3, fuelUsedKg = 0): FlightEnv => ({ ...DEFAULT_FLIGHT_ENV, wind, fuelUsedKg });

describe('wind and fuel in the flight model (revision 16)', () => {
  const c = getAircraft('kestrel');

  it('flies in the moving air: the track drifts downwind while airspeed and height hold', () => {
    const calm = level(250, 5000, 0.75);
    const windy = level(250, 5000, 0.75);
    // A 20 m/s wind from the west, across the jet's northbound track.
    windy.vel.x += 20;
    fly(calm, c, 30, {});
    fly(windy, c, 30, {}, undefined, envWith(new Vector3(20, 0, 0)));
    expect(windy.pos.x - calm.pos.x).toBeCloseTo(600, 3);
    expect(windy.airspeed).toBeCloseTo(calm.airspeed, 6);
    expect(windy.pos.y).toBeCloseTo(calm.pos.y, 3);
  });

  it('reads a headwind as airspeed: the same ground speed into the wind gives more lift', () => {
    const alphaRad = trimAlpha(c.physics, 150, atmosphere(3000).density);
    const s = createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 150, throttle: 0.75, alphaRad });
    fly(s, c, DT, {}, undefined, envWith(new Vector3(0, 0, 30)));
    // Northbound (-z) into a wind blowing south (+z): 30 m/s more air over the wings, (180 / 150)² the lift.
    expect(s.airspeed).toBeCloseTo(180, 0);
    expect(s.gLoad).toBeGreaterThan(1.3);
  });

  it('reports the fuel flow for the throttle and air, and none when the engines are out', () => {
    const s = level(250, 300, 1);
    s.throttle = 1;
    fly(s, c, DT, { throttle: 1 });
    expect(s.fuelFlow).toBeCloseTo(fuelFlowKgS(1, c.physics, atmosphere(s.pos.y).sigma, s.mach), 3);
    fly(s, c, DT, { throttle: 1 }, undefined, { ...DEFAULT_FLIGHT_ENV, thrustScale: 0 });
    expect(s.fuelFlow).toBe(0);
    expect(s.thrust).toBe(0);
  });

  it('accelerates and turns better as the fuel burns off', () => {
    const full = level(200, 3000, 1);
    const light = level(200, 3000, 1);
    fly(full, c, 10, { throttle: 1 });
    fly(light, c, 10, { throttle: 1 }, undefined, envWith(new Vector3(), c.physics.fuelKg));
    expect(light.airspeed - full.airspeed).toBeGreaterThan(10);
  });
});

describe('departures and spins (revision 16)', () => {
  /** Full aft stick and full roll from a slow, level start; the time the spin began, or null. */
  const yankAndBank = (id: string, speed: number, altitude: number) => {
    const c = getAircraft(id);
    const s = level(speed, altitude, 0.9);
    let at: number | null = null;
    fly(s, c, 8, (t, st) => {
      if (at === null && st.spin !== 0) at = t;
      return { pitch: 1, roll: 1, throttle: 0.9 };
    });
    return at;
  };
  /** A developed spin to the right: started from slow level flight and held with pro-spin controls. */
  const spinning = (id: string, altitude = 7000) => {
    const s = level(70, altitude, 0.4);
    s.spin = 1;
    fly(s, getAircraft(id), 8, { pitch: 1, yaw: 1, throttle: 0.4 });
    return s;
  };

  it('departs a departure-prone jet stalled slow with full aft stick and roll', () => {
    expect(yankAndBank('shade', 70, 2000)).not.toBeNull();
    expect(yankAndBank('shade', 110, 8000)).not.toBeNull();
  });

  it('keeps hard-limited and thrust-vectoring jets in control in the same abuse', () => {
    for (const id of ['kestrel', 'condor', 'prizrak', 'yastreb']) expect(yankAndBank(id, 70, 2000), id).toBeNull();
  });

  for (const c of listAircraft()) {
    it(`${c.name} never departs in a hard turn at fighting speed`, () => {
      const s = level(200, 3000, 1);
      fly(s, c, 6, (_t, st) => {
        expect(st.spin).toBe(0);
        return { pitch: 1, roll: 0.4, throttle: 1 };
      });
    });

    it(`${c.name} falls at a spin's rate, holds the spin while pro-spin, and recovers with neutral controls`, () => {
      const s = spinning(c.id);
      expect(s.spin).toBe(1);
      expect(-s.vel.y).toBeGreaterThan(50);
      expect(-s.vel.y).toBeLessThan(110);
      fly(s, c, 6, { pitch: 1, yaw: 1, throttle: 0.4 });
      expect(s.spin).toBe(1);
      let recovered: number | null = null;
      fly(s, c, 8, (t, st) => {
        if (recovered === null && st.spin === 0) recovered = t;
        return { throttle: 0.4 };
      });
      expect(recovered).not.toBeNull();
      expect(recovered!).toBeLessThan(6);
    });

    it(`${c.name} recovers faster with opposite rudder and the stick forward, and does not spin again at once`, () => {
      const neutral = spinning(c.id);
      const anti = spinning(c.id);
      const time = (s: FlightState, input: Partial<ControlInput>) => {
        let t = 0;
        while (s.spin !== 0 && t < 10) {
          fly(s, c, DT, input);
          t += DT;
        }
        return t;
      };
      const tNeutral = time(neutral, { throttle: 0.4 });
      const tAnti = time(anti, { pitch: -1, yaw: -1, throttle: 0.4 });
      expect(tAnti).toBeLessThan(tNeutral);
      fly(anti, c, 3, (_t, st) => {
        expect(st.spin).toBe(0);
        return { throttle: 0.9 };
      });
    });
  }

  it('drops a jet that runs out of airspeed nose-high into a spin, thrust vectoring or not (it needs thrust)', () => {
    for (const id of ['kestrel', 'prizrak']) {
      const s = createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, pitchRad: 85 * DEG, speed: 180, throttle: 0 });
      let spun = false;
      fly(s, getAircraft(id), 30, (_t, st) => {
        spun ||= st.spin !== 0;
        return { throttle: 0 };
      });
      expect(spun, id).toBe(true);
    }
  });
});
