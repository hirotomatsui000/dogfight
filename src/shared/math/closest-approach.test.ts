import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { closestApproach } from './closest-approach.ts';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

describe('closestApproach', () => {
  it('finds a pass in the middle of the interval', () => {
    // a flies +x through the origin; b sits 3 m above the origin
    const r = closestApproach(v(-50, 0, 0), v(50, 0, 0), v(0, 3, 0), v(0, 3, 0));
    expect(r.distance).toBeCloseTo(3, 9);
    expect(r.fraction).toBeCloseTo(0.5, 9);
  });

  it('catches two fast movers that cross between the end points (no tunneling)', () => {
    // head-on: both ends are 20 m apart, but they pass within 1 m halfway
    const r = closestApproach(v(0, 0, -10), v(0, 0, 10), v(1, 0, 10), v(1, 0, -10));
    expect(r.distance).toBeCloseTo(1, 9);
    expect(r.fraction).toBeCloseTo(0.5, 9);
  });

  it('clamps to the interval', () => {
    const r = closestApproach(v(10, 0, 0), v(20, 0, 0), v(0, 0, 0), v(0, 0, 0));
    expect(r.distance).toBeCloseTo(10, 9);
    expect(r.fraction).toBe(0);
  });

  it('handles points moving together', () => {
    const r = closestApproach(v(0, 0, 0), v(5, 0, 0), v(0, 4, 0), v(5, 4, 0));
    expect(r.distance).toBeCloseTo(4, 9);
  });
});
