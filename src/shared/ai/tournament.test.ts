import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { allPairings, formatTournament, isBalanced, runPairing, SEEDS_PER_PAIRING, seedRange, usaWinRate } from './tournament.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);

describe('balance tournament (spec §9.4)', () => {
  it('pairs every USA jet with every Russian jet', () => {
    const pairs = allPairings();
    expect(pairs).toHaveLength(16);
    expect(pairs).toContainEqual(['condor', 'sapsan']);
  });

  it('counts wins, losses and draws, and rates the decided duels', () => {
    const r = runPairing(map, terrain, 'kestrel', 'kobchik', seedRange(4));
    expect(r.usaWins + r.russiaWins + r.draws).toBe(4);
    expect(usaWinRate({ usa: 'a', russia: 'b', usaWins: 3, russiaWins: 1, draws: 6 })).toBe(0.75);
    expect(usaWinRate({ usa: 'a', russia: 'b', usaWins: 0, russiaWins: 0, draws: 6 })).toBe(0.5);
    expect(isBalanced({ usa: 'a', russia: 'b', usaWins: 13, russiaWins: 7, draws: 0 })).toBe(true);
    expect(isBalanced({ usa: 'a', russia: 'b', usaWins: 14, russiaWins: 6, draws: 0 })).toBe(false);
    expect(formatTournament([r])).toContain('kestrel');
    expect(seedRange(3, 101)).toEqual([101, 102, 103]);
  });

  // The full run takes a minute or two on one core: `TOURNAMENT=1 npm test`, or `npm run tournament` in parallel.
  it.runIf(process.env.TOURNAMENT === '1')(
    `keeps every pairing within 35–65% over ${SEEDS_PER_PAIRING} seeds`,
    () => {
      const off = allPairings()
        .map(([u, r]) => runPairing(map, terrain, u, r, seedRange()))
        .filter((r) => !isBalanced(r));
      expect(off.map((r) => `${r.usa}-${r.russia} ${Math.round(usaWinRate(r) * 100)}%`)).toEqual([]);
    },
    900000,
  );
});
