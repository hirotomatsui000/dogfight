import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { createGroundTarget, damageGroundTarget, GROUND_TARGET_HP, hitsToDestroy } from './ground-targets.ts';

const terrain = buildTerrain(createTestRange(1));
const depot = () => createGroundTarget({ id: 'A', kind: 'depot', label: 'Supply depot', x: -5000, z: -8000 }, terrain);

describe('ground targets', () => {
  it('stand on the ground with full hit points', () => {
    const t = depot();
    expect(t.pos.y).toBeCloseTo(terrain.surfaceAt(-5000, -8000), 6);
    expect([t.hp, t.maxHp, t.destroyed]).toEqual([GROUND_TARGET_HP, 100, false]);
  });

  it('take damage until destroyed, then ignore further hits', () => {
    const t = depot();
    expect(damageGroundTarget(t, 40)).toBe('hit');
    expect(damageGroundTarget(t, 40)).toBe('hit');
    expect(damageGroundTarget(t, 40)).toBe('destroyed');
    expect([t.hp, t.destroyed]).toEqual([0, true]);
    expect(damageGroundTarget(t, 40)).toBeNull();
    expect(damageGroundTarget(depot(), 0)).toBeNull();
  });

  it('count the full-damage hits still needed', () => {
    const t = depot();
    expect(hitsToDestroy(t, 40)).toBe(3);
    damageGroundTarget(t, 70);
    expect(hitsToDestroy(t, 40)).toBe(1);
    damageGroundTarget(t, 30);
    expect(hitsToDestroy(t, 40)).toBe(0);
  });
});
