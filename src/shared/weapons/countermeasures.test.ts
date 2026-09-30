import { describe, expect, it } from 'vitest';
import { SRM_DART } from '../data/weapons.ts';
import { Rng } from '../math/rng.ts';
import { decoyChance, rollDecoy } from './countermeasures.ts';

const rate = (chance: number, seed: number) => {
  const rng = new Rng(seed);
  let decoyed = 0;
  for (let i = 0; i < 1000; i++) if (rollDecoy(rng, chance)) decoyed++;
  return decoyed / 1000;
};

describe('countermeasures', () => {
  it('decoys a short-range missile 35% of the time, half as often against afterburner', () => {
    expect(decoyChance(SRM_DART, false)).toBeCloseTo(0.35, 9);
    expect(decoyChance(SRM_DART, true)).toBeCloseTo(0.175, 9);
  });

  it('matches the expected rate within ±5% over 1,000 seeded trials', () => {
    for (const seed of [1, 2, 3]) {
      expect(Math.abs(rate(decoyChance(SRM_DART, false), seed) - 0.35)).toBeLessThan(0.05);
      expect(Math.abs(rate(decoyChance(SRM_DART, true), seed) - 0.175)).toBeLessThan(0.05);
    }
  });
});
