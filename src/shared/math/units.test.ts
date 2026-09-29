import { describe, expect, it } from 'vitest';
import { approach, clamp, DEG, lerp, moveToward, MS_TO_KT, smoothstep, wrapAngle } from './units.ts';

describe('units', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
  it('lerps and smoothsteps', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });
  it('approaches a target with a first-order lag', () => {
    expect(approach(0, 1, 1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(approach(3, 3, 0.1, 0.5)).toBe(3);
  });
  it('moves toward a target by at most maxDelta', () => {
    expect(moveToward(0, 1, 0.25)).toBe(0.25);
    expect(moveToward(0.9, 1, 0.25)).toBe(1);
    expect(moveToward(1, 0, 0.25)).toBe(0.75);
  });
  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(wrapAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10);
    expect(wrapAngle(190 * DEG)).toBeCloseTo(-170 * DEG, 10);
  });
  it('converts units', () => {
    expect(100 * MS_TO_KT).toBeCloseTo(194.38, 2);
  });
});
