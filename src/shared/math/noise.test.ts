import { describe, expect, it } from 'vitest';
import { createNoise2D, fbm2D } from './noise.ts';

describe('simplex noise', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = createNoise2D(5);
    const b = createNoise2D(5);
    const c = createNoise2D(6);
    expect(a(1.3, 7.7)).toBe(b(1.3, 7.7));
    expect(a(1.3, 7.7)).not.toBe(c(1.3, 7.7));
  });
  it('stays within [-1, 1] and varies', () => {
    const n = createNoise2D(1);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 20000; i++) {
      const v = n(i * 0.173, i * 0.071);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(-1.05);
    expect(max).toBeLessThanOrEqual(1.05);
    expect(max - min).toBeGreaterThan(1.2);
  });
  it('is continuous', () => {
    const n = createNoise2D(3);
    expect(Math.abs(n(10, 10) - n(10.001, 10))).toBeLessThan(0.01);
  });
  it('fbm is normalized', () => {
    const n = createNoise2D(8);
    for (let i = 0; i < 2000; i++) {
      const v = fbm2D(n, i * 0.37, i * 0.11, 5);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.05);
    }
  });
});
