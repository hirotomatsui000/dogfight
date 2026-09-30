import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { G0 } from '../math/units.ts';
import { ballisticPosition, ballisticVelocity, muzzleDistance, muzzleTime } from './ballistics.ts';

const origin = new Vector3(10, 2000, -30);
const inherited = new Vector3(0, 0, -250);
const dir = new Vector3(0.6, 0, -0.8);

describe('ballistics', () => {
  it('starts at the muzzle', () => {
    expect(ballisticPosition(origin, inherited, dir, 1000, 4e-4, 0, new Vector3()).distanceTo(origin)).toBe(0);
  });

  it('without drag flies straight at muzzle speed plus the inherited velocity, and falls under gravity', () => {
    const p = ballisticPosition(origin, inherited, dir, 1000, 0, 2, new Vector3());
    expect(p.x).toBeCloseTo(10 + 0.6 * 2000, 6);
    expect(p.z).toBeCloseTo(-30 - 500 - 0.8 * 2000, 6);
    expect(p.y).toBeCloseTo(2000 - 0.5 * G0 * 4, 6);
  });

  it('drag shortens the distance flown and muzzleTime inverts muzzleDistance', () => {
    expect(muzzleDistance(1030, 4e-4, 1)).toBeLessThan(1030);
    expect(muzzleDistance(1030, 4e-4, 1)).toBeGreaterThan(700);
    for (const t of [0.1, 0.8, 2.5]) expect(muzzleTime(1030, 4e-4, muzzleDistance(1030, 4e-4, t))).toBeCloseTo(t, 9);
    expect(muzzleTime(1000, 0, 500)).toBeCloseTo(0.5, 12);
  });

  it('reports the velocity that matches the position curve', () => {
    const t = 1.3;
    const h = 1e-4;
    const a = ballisticPosition(origin, inherited, dir, 1030, 4e-4, t - h, new Vector3());
    const b = ballisticPosition(origin, inherited, dir, 1030, 4e-4, t + h, new Vector3());
    const numeric = b.sub(a).divideScalar(2 * h);
    const v = ballisticVelocity(inherited, dir, 1030, 4e-4, t, new Vector3());
    expect(v.distanceTo(numeric)).toBeLessThan(1e-3);
  });
});
