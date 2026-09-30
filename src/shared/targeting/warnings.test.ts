import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SRM_DART } from '../data/weapons.ts';
import { DEG } from '../math/units.ts';
import { testAircraft } from '../testing/fixtures.ts';
import type { Missile } from '../weapons/missile.ts';
import { incomingMissileWarning } from './warnings.ts';

const missile = (id: number, targetId: number | null, x: number, z: number): Missile => ({
  id, spec: SRM_DART, ownerId: 9, team: 'russia', targetId, pos: new Vector3(x, 3000, z), prevPos: new Vector3(x, 3000, z), vel: new Vector3(), ageS: 1, lateralAccel: 0,
});

describe('incomingMissileWarning', () => {
  const me = testAircraft(1, 'kestrel', 0, 3000, 0); // heading north

  it('warns about the nearest missile guiding on me within 3 km', () => {
    const w = incomingMissileWarning(me, [missile(5, 1, 0, 2500), missile(6, 1, 1500, 0), missile(7, 2, 0, 100)]);
    expect(w?.missileId).toBe(6);
    expect(w?.rangeM).toBeCloseTo(1500, 6);
    expect(w?.bearingRad).toBeCloseTo(90 * DEG, 6);
  });

  it('gives a bearing behind for a missile in the six o’clock', () => {
    expect(Math.abs(incomingMissileWarning(me, [missile(5, 1, 0, 2000)])?.bearingRad ?? 0)).toBeCloseTo(Math.PI, 6);
  });

  it('stays quiet for distant or decoyed missiles', () => {
    expect(incomingMissileWarning(me, [missile(5, 1, 0, 3500), missile(6, null, 0, 500)])).toBeNull();
  });
});
