import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { DIFFICULTIES } from './difficulty.ts';
import { runDuel } from './duel.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);

describe('runDuel', () => {
  it('fights to the first death and reports the survivor', () => {
    const r = runDuel(map, terrain, [{ aircraftId: 'kestrel', profile: DIFFICULTIES.ace }, { aircraftId: 'kobchik', profile: DIFFICULTIES.rookie }], 1);
    expect(r.winner).not.toBeNull();
    expect(r.cause).not.toBeNull();
    expect(r.timeS).toBeGreaterThan(5);
  });

  it('is deterministic per seed', () => {
    const sides = [{ aircraftId: 'kestrel', profile: DIFFICULTIES.veteran }, { aircraftId: 'kobchik', profile: DIFFICULTIES.veteran }] as const;
    expect(runDuel(map, terrain, sides, 4)).toEqual(runDuel(map, terrain, sides, 4));
  });

  it('needs one aircraft from each team', () => {
    expect(() => runDuel(map, terrain, [{ aircraftId: 'kestrel', profile: DIFFICULTIES.ace }, { aircraftId: 'kestrel', profile: DIFFICULTIES.ace }], 1)).toThrow(/each team/);
  });
});
