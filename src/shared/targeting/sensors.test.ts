import { describe, expect, it } from 'vitest';
import { DEG } from '../math/units.ts';
import { blockedTerrain, openTerrain, testAircraft } from '../testing/fixtures.ts';
import { type Contact, detectContacts } from './sensors.ts';

const scan = (observer = testAircraft(1, 'kestrel', 0, 3000, 0), ...others: ReturnType<typeof testAircraft>[]) =>
  detectContacts(observer, [observer, ...others], openTerrain, []);

describe('detectContacts', () => {
  it('sees an enemy within 6 km, or 8 km when it is on afterburner', () => {
    // 7 km behind: outside the radar cone, so only the eyes can find it
    expect(scan(undefined, testAircraft(2, 'kobchik', 0, 3000, 7000, 0, 0.8))).toEqual([]);
    const [c] = scan(undefined, testAircraft(2, 'kobchik', 0, 3000, 7000, 0, 1));
    expect(c).toMatchObject({ id: 2, visual: true, radar: false });
    expect(scan(undefined, testAircraft(2, 'kobchik', 0, 3000, 5000))[0].visual).toBe(true);
  });

  it('finds enemies ahead on radar out to its range reduced by their stealth', () => {
    // Kestrel radar 35 km, Kobchik stealth 0.15: 35 × (1 − 0.7 × 0.15) = 31.3 km
    expect(scan(undefined, testAircraft(2, 'kobchik', 0, 3000, -31000))[0]).toMatchObject({ radar: true, visual: false });
    expect(scan(undefined, testAircraft(2, 'kobchik', 0, 3000, -32000))).toEqual([]);
  });

  it('only looks inside the radar cone', () => {
    const offCone = testAircraft(2, 'kobchik', 20000 * Math.sin(70 * DEG), 3000, -20000 * Math.cos(70 * DEG));
    expect(scan(undefined, offCone)).toEqual([]);
  });

  it('ignores team-mates, dead aircraft and aircraft behind terrain', () => {
    const mate = testAircraft(2, 'kestrel', 0, 3000, -2000);
    const dead = { ...testAircraft(3, 'kobchik', 0, 3000, -2000), alive: false };
    expect(scan(undefined, mate, dead)).toEqual([]);
    const observer = testAircraft(1, 'kestrel', 0, 3000, 0);
    expect(detectContacts(observer, [testAircraft(2, 'kobchik', 0, 3000, -2000)], blockedTerrain, [])).toEqual([]);
  });

  it('reports range and angle off the nose, and rewrites the output list', () => {
    const out: Contact[] = [{ id: 99, visual: true, radar: true, rangeM: 1, offNoseRad: 0 }];
    const observer = testAircraft(1, 'kestrel', 0, 3000, 0);
    detectContacts(observer, [testAircraft(2, 'kobchik', 3000, 3000, -3000)], openTerrain, out);
    expect(out).toHaveLength(1);
    expect(out[0].rangeM).toBeCloseTo(3000 * Math.SQRT2, 6);
    expect(out[0].offNoseRad).toBeCloseTo(45 * DEG, 6);
  });
});
