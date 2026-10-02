import { describe, expect, it } from 'vitest';
import { kestrel } from '../data/aircraft/kestrel.ts';
import { listAircraft } from '../data/aircraft/registry.ts';
import { DEG } from '../math/units.ts';
import { cornerSpeed, dragCoefficient, fuelFlowKgS, liftCoefficient, stallSpeed, thrustNewtons, trimAlpha, waveDragFactor } from './aero.ts';

const p = kestrel.physics;

describe('trimAlpha', () => {
  it('gives the angle of attack for 1 G level flight', () => {
    const alpha = trimAlpha(p, 250, 1.225);
    const lift = 0.5 * 1.225 * 250 * 250 * p.wingAreaM2 * liftCoefficient(alpha, p);
    expect(lift / (p.massKg * 9.80665)).toBeCloseTo(1, 6);
  });
  it('is capped at alpha max below stall speed', () => {
    expect(trimAlpha(p, 30, 1.225)).toBeCloseTo(p.alphaMaxDeg * DEG, 10);
  });
});

describe('liftCoefficient', () => {
  it('is linear below alpha max', () => {
    expect(liftCoefficient(10 * DEG, p)).toBeCloseTo(4.2 * 10 * DEG, 6);
  });
  it('peaks at alpha max and drops beyond', () => {
    const peak = liftCoefficient(25 * DEG, p);
    expect(peak).toBeCloseTo(4.2 * 25 * DEG, 6);
    expect(liftCoefficient(26 * DEG, p)).toBeLessThan(peak);
    expect(liftCoefficient(40 * DEG, p)).toBeCloseTo(0.6 * peak, 6);
  });
  it('is continuous and symmetric', () => {
    for (const a of [25, 40, 50]) {
      expect(liftCoefficient((a - 0.001) * DEG, p)).toBeCloseTo(liftCoefficient((a + 0.001) * DEG, p), 3);
    }
    expect(liftCoefficient(-12 * DEG, p)).toBeCloseTo(-liftCoefficient(12 * DEG, p), 10);
  });
});

describe('waveDragFactor', () => {
  it('follows the transonic drag rise', () => {
    expect(waveDragFactor(0.5)).toBe(1);
    expect(waveDragFactor(0.85)).toBe(1);
    expect(waveDragFactor(1.05)).toBeCloseTo(2.2, 10);
    expect(waveDragFactor(2)).toBeCloseTo(1.6, 10);
    expect(waveDragFactor(3)).toBe(1.6);
    expect(waveDragFactor(0.95)).toBeGreaterThan(1);
    expect(waveDragFactor(0.95)).toBeLessThan(2.2);
  });
});

describe('dragCoefficient', () => {
  it('adds parasite and induced drag', () => {
    expect(dragCoefficient(0.5, 0.5, 5 * DEG, 0, 0, p)).toBeCloseTo(0.02 + 0.13 * 0.25, 10);
  });
  it('adds airbrake and sideslip drag', () => {
    const base = dragCoefficient(0.5, 0.3, 3 * DEG, 0, 0, p);
    expect(dragCoefficient(0.5, 0.3, 3 * DEG, 0, 1, p) - base).toBeCloseTo(0.08, 10);
    expect(dragCoefficient(0.5, 0.3, 3 * DEG, 0.1, 0, p) - base).toBeCloseTo(0.005, 10);
  });
  it('raises induced drag when supersonic and adds post-stall drag', () => {
    const sub = dragCoefficient(0.9, 0.3, 3 * DEG, 0, 0, p) - 0.02 * waveDragFactor(0.9);
    const sup = dragCoefficient(1.5, 0.3, 3 * DEG, 0, 0, p) - 0.02 * waveDragFactor(1.5);
    expect(sup / sub).toBeCloseTo(1.4, 6);
    expect(dragCoefficient(0.3, 1, 45 * DEG, 0, 0, p)).toBeGreaterThan(dragCoefficient(0.3, 1, 20 * DEG, 0, 0, p) + 0.1);
  });
});

describe('thrustNewtons', () => {
  it('maps the throttle to idle, military and afterburner', () => {
    expect(thrustNewtons(0, p, 1, 0)).toBeCloseTo(0.05 * 76000, 6);
    expect(thrustNewtons(0.9, p, 1, 0)).toBeCloseTo(76000, 6);
    expect(thrustNewtons(1, p, 1, 0)).toBeCloseTo(130000, 6);
    expect(thrustNewtons(0.95, p, 1, 0)).toBeCloseTo(103000, 6);
  });
  it('lapses with altitude and gains ram thrust at speed', () => {
    expect(thrustNewtons(1, p, 0.3, 0)).toBeCloseTo(130000 * Math.pow(0.3, 0.75), 6);
    expect(thrustNewtons(1, p, 0.3, 2)).toBeCloseTo(130000 * Math.pow(0.3, 0.75) * (1 + 0.2 * 2 * 0.7), 6);
  });
  it('applies a damage thrust scale', () => {
    expect(thrustNewtons(1, p, 1, 0, 0.75)).toBeCloseTo(97500, 6);
  });
});

describe('fuelFlowKgS (revision 16)', () => {
  it('burns about 1.6 kg/s at military power and 7.4 kg/s in full afterburner (Kestrel, sea level)', () => {
    expect(fuelFlowKgS(0.9, p, 1, 0)).toBeCloseTo(1.6, 1);
    expect(fuelFlowKgS(1, p, 1, 0)).toBeCloseTo(7.3, 1);
  });
  it('rises with the throttle, never stops at idle, and falls with the thinner air up high', () => {
    let last = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const f = fuelFlowKgS(t, p, 1, 0);
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
    expect(fuelFlowKgS(0, p, 1, 0)).toBeGreaterThan(0.1);
    expect(fuelFlowKgS(1, p, 0.3, 0.9)).toBeLessThan(0.5 * fuelFlowKgS(1, p, 1, 0));
    expect(fuelFlowKgS(1, p, 1, 0, 0)).toBe(0);
  });
  it('empties every fighter in 5 to 13 minutes of full afterburner at sea level, and much later at military power', () => {
    for (const c of listAircraft()) {
      const ab = c.physics.fuelKg / fuelFlowKgS(1, c.physics, 1, 0) / 60;
      const mil = c.physics.fuelKg / fuelFlowKgS(0.9, c.physics, 1, 0) / 60;
      expect(ab, c.id).toBeGreaterThan(5);
      expect(ab, c.id).toBeLessThan(13);
      expect(mil, c.id).toBeGreaterThan(25);
    }
  });
});

describe('stallSpeed', () => {
  it.each(listAircraft().map((c) => [c.id, c] as const))('is within the performance target at sea level: %s', (_id, c) => {
    const v = stallSpeed(c.physics, 1.225);
    expect(v).toBeGreaterThan(c.performance.stallSpeedMs[0]);
    expect(v).toBeLessThan(c.performance.stallSpeedMs[1]);
  });
});

describe('cornerSpeed', () => {
  it('is the speed where maximum lift gives the G limit', () => {
    const v = cornerSpeed(p, 0.909);
    const lift = 0.5 * 0.909 * v * v * p.wingAreaM2 * liftCoefficient(p.alphaMaxDeg * DEG, p);
    expect(lift / (p.massKg * 9.80665)).toBeCloseTo(p.gMax, 6);
    expect(v).toBeCloseTo(stallSpeed(p, 0.909) * Math.sqrt(p.gMax), 6);
  });
});
