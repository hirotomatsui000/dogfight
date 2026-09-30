import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SRM_DART } from '../data/weapons.ts';
import { DEG } from '../math/units.ts';
import { testAircraft } from '../testing/fixtures.ts';
import type { Missile } from '../weapons/missile.ts';
import { incomingMissileWarning } from './warnings.ts';

/** A missile at (x, 3000, z) flying with `vel`. */
const missile = (id: number, targetId: number | null, x: number, z: number, vel = new Vector3()): Missile => ({
  id,
  spec: SRM_DART,
  ownerId: 9,
  team: 'russia',
  targetId,
  pos: new Vector3(x, 3000, z),
  prevPos: new Vector3(x, 3000, z),
  vel,
  ageS: 1,
  accel: new Vector3(),
  lateralAccel: 0,
});

describe('incomingMissileWarning', () => {
  const me = testAircraft(1, 'kestrel', 0, 3000, 0); // heading north (-z) at 250 m/s

  it('warns from launch, however far away the missile is', () => {
    const w = incomingMissileWarning(me, [missile(5, 1, 0, -8000, new Vector3(0, 0, 700))]);
    expect(w?.missileId).toBe(5);
    expect(w?.rangeM).toBeCloseTo(8000, 6);
  });

  it('reports the closure rate and the time to impact', () => {
    // 1.5 km to the east, flying west at 900 m/s while I fly north: it closes at 900 m/s.
    const w = incomingMissileWarning(me, [missile(6, 1, 1500, 0, new Vector3(-900, 0, 0))]);
    expect(w?.closureMs).toBeCloseTo(900, 6);
    expect(w?.timeToImpactS).toBeCloseTo(1500 / 900, 6);
    expect(w?.bearingRad).toBeCloseTo(90 * DEG, 6);
  });

  it('warns about the missile that will arrive first, not the nearest one', () => {
    const slow = missile(5, 1, 0, 2000, new Vector3(0, 0, -650)); // chasing from behind: closes at 400 m/s, 5 s
    const fast = missile(6, 1, 0, -3000, new Vector3(0, 0, 1250)); // head-on: closes at 1500 m/s, 2 s
    expect(incomingMissileWarning(me, [slow, fast])?.missileId).toBe(6);
  });

  it('gives a bearing behind for a missile in the six o’clock', () => {
    const w = incomingMissileWarning(me, [missile(5, 1, 0, 2000, new Vector3(0, 0, -800))]);
    expect(Math.abs(w?.bearingRad ?? 0)).toBeCloseTo(Math.PI, 6);
  });

  it('stays quiet for decoyed missiles and missiles guiding on someone else', () => {
    expect(incomingMissileWarning(me, [missile(5, 2, 0, -1000, new Vector3(0, 0, 900)), missile(6, null, 0, 500)])).toBeNull();
  });
});
