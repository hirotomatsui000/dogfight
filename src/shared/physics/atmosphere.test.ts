import { describe, expect, it } from 'vitest';
import { atmosphere } from './atmosphere.ts';

const within = (actual: number, expected: number, pct: number) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(pct / 100);

describe('ISA atmosphere', () => {
  it.each([
    [0, 1.225, 288.15, 340.29],
    [5000, 0.73612, 255.65, 320.53],
    [11000, 0.36392, 216.65, 295.07],
    [15000, 0.19476, 216.65, 295.07],
  ])('matches ISA at %i m within 1%%', (h, rho, t, a) => {
    const air = atmosphere(h);
    within(air.density, rho, 1);
    within(air.temperature, t, 1);
    within(air.speedOfSound, a, 1);
    within(air.sigma, rho / 1.225, 1);
  });
  it('is continuous at the tropopause', () => {
    expect(atmosphere(10999.9).density).toBeCloseTo(atmosphere(11000.1).density, 4);
  });
  it('clamps extreme altitudes', () => {
    expect(atmosphere(-5000).density).toBe(atmosphere(-500).density);
    expect(atmosphere(90000).density).toBe(atmosphere(20000).density);
  });
  it('writes into a provided object', () => {
    const out = { density: 0, temperature: 0, speedOfSound: 0, sigma: 0 };
    expect(atmosphere(1000, out)).toBe(out);
    expect(out.density).toBeGreaterThan(1.1);
  });
});
