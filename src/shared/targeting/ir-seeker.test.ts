import { describe, expect, it } from 'vitest';
import { SRM_DART } from '../data/weapons.ts';
import { DEG } from '../math/units.ts';
import { blockedTerrain, openTerrain, type TestAircraft, testAircraft } from '../testing/fixtures.ts';
import { createSeeker, irLockRange, updateSeeker } from './ir-seeker.ts';

const DT = 1 / 60;

/** Updates until locked (or `max` updates) and returns how many updates it took. */
function updatesToLock(owner: TestAircraft, target: TestAircraft, designated: TestAircraft | null = null, max = 200) {
  const s = createSeeker();
  for (let i = 1; i <= max; i++) {
    updateSeeker(s, owner, [target], designated, SRM_DART, openTerrain, DT);
    if (s.mode === 'locked') return i;
  }
  return Infinity;
}

const at = (deg: number, rangeM: number) => [rangeM * Math.sin(deg * DEG), 3000, -rangeM * Math.cos(deg * DEG)] as const;

describe('irLockRange', () => {
  it('reaches 9 km from behind and 4 km head-on, times the target IR signature', () => {
    const target = testAircraft(2, 'kestrel', 0, 3000, -5000, 0); // flying north, away from the origin
    expect(irLockRange(SRM_DART, testAircraft(1, 'kobchik', 0, 3000, 0).flight.pos, target)).toBeCloseTo(9000, 3);
    const headOn = testAircraft(3, 'kestrel', 0, 3000, -5000, 180);
    expect(irLockRange(SRM_DART, testAircraft(1, 'kobchik', 0, 3000, 0).flight.pos, headOn)).toBeCloseTo(4000, 3);
    const base = testAircraft(4, 'kobchik', 0, 3000, -5000, 0);
    const hot = { ...base, config: { ...base.config, sensors: { ...base.config.sensors, irSignature: 1.2 } } };
    expect(irLockRange(SRM_DART, testAircraft(1, 'kestrel', 0, 3000, 0).flight.pos, hot)).toBeCloseTo(10800, 3);
  });

  it('is 30% longer against afterburner', () => {
    const target = testAircraft(2, 'kestrel', 0, 3000, -5000, 0, 1);
    expect(irLockRange(SRM_DART, testAircraft(1, 'kobchik', 0, 3000, 0).flight.pos, target)).toBeCloseTo(11700, 3);
  });
});

describe('updateSeeker', () => {
  it('tracks a target on the nose and locks after 0.8 s', () => {
    const owner = testAircraft(1, 'kestrel', 0, 3000, 0);
    const target = testAircraft(2, 'kobchik', 0, 3000, -3000);
    expect(updatesToLock(owner, target)).toBe(1 + 48);
  });

  it('locks 30% faster with a helmet sight', () => {
    const owner = testAircraft(1, 'kobchik', 0, 3000, 0);
    const target = testAircraft(2, 'kestrel', 0, 3000, -3000);
    expect(updatesToLock(owner, target)).toBe(1 + Math.ceil(0.56 * 60));
  });

  it('does not lock beyond the lock range or behind terrain', () => {
    const owner = testAircraft(1, 'kestrel', 0, 3000, 0);
    expect(updatesToLock(owner, testAircraft(2, 'kobchik', 0, 3000, -10500))).toBe(Infinity);
    const s = createSeeker();
    updateSeeker(s, owner, [testAircraft(2, 'kobchik', 0, 3000, -3000)], null, SRM_DART, blockedTerrain, DT);
    expect(s.mode).toBe('search');
  });

  it('looks toward a designated target inside the off-boresight limit', () => {
    const owner = testAircraft(1, 'kestrel', 0, 3000, 0);
    const target = testAircraft(2, 'kobchik', ...at(50, 3000));
    expect(updatesToLock(owner, target)).toBe(Infinity);
    expect(updatesToLock(owner, target, target)).toBe(49);
  });

  it('allows 75 degrees off the nose only with a helmet sight', () => {
    const kestrel = testAircraft(1, 'kestrel', 0, 3000, 0);
    const kobchik = testAircraft(1, 'kobchik', 0, 3000, 0);
    expect(updatesToLock(kestrel, testAircraft(2, 'kobchik', ...at(70, 3000)), testAircraft(2, 'kobchik', ...at(70, 3000)))).toBe(Infinity);
    const target = testAircraft(2, 'kestrel', ...at(70, 3000));
    expect(updatesToLock(kobchik, target, target)).toBeLessThan(60);
  });

  it('follows the helmet sight while the pilot looks around', () => {
    const owner = testAircraft(1, 'kobchik', 0, 3000, 0);
    owner.input.helmetSight = true;
    owner.input.lookYaw = 70 * DEG;
    expect(updatesToLock(owner, testAircraft(2, 'kestrel', ...at(70, 3000)))).toBeLessThan(60);
    const noHelmet = testAircraft(1, 'kestrel', 0, 3000, 0);
    noHelmet.input.helmetSight = true;
    noHelmet.input.lookYaw = 40 * DEG;
    expect(updatesToLock(noHelmet, testAircraft(2, 'kobchik', ...at(40, 3000)))).toBe(Infinity);
  });

  it('keeps a lock out to 1.2 times the lock range and drops it outside the limit', () => {
    const owner = testAircraft(1, 'kestrel', 0, 3000, 0);
    const target = testAircraft(2, 'kobchik', 0, 3000, -3000);
    const s = createSeeker();
    for (let i = 0; i < 60; i++) updateSeeker(s, owner, [target], null, SRM_DART, openTerrain, DT);
    expect(s.mode).toBe('locked');
    target.flight.pos.set(0, 3000, -10500); // beyond the 9 km lock range, inside 1.2 × 9 km
    updateSeeker(s, owner, [target], null, SRM_DART, openTerrain, DT);
    expect(s.mode).toBe('locked');
    target.flight.pos.set(...at(65, 3000));
    updateSeeker(s, owner, [target], null, SRM_DART, openTerrain, DT);
    expect(s.mode).toBe('search');
    expect(s.targetId).toBeNull();
  });

  it('switches to a newly designated target', () => {
    const owner = testAircraft(1, 'kestrel', 0, 3000, 0);
    const first = testAircraft(2, 'kobchik', 0, 3000, -3000);
    const second = testAircraft(3, 'kobchik', ...at(20, 2500));
    const s = createSeeker();
    for (let i = 0; i < 60; i++) updateSeeker(s, owner, [first, second], null, SRM_DART, openTerrain, DT);
    expect(s.targetId).toBe(2);
    updateSeeker(s, owner, [first, second], second, SRM_DART, openTerrain, DT);
    expect(s.targetId).toBe(3);
    expect(s.mode).toBe('track');
  });
});
