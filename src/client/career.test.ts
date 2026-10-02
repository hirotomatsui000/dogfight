import { describe, expect, it } from 'vitest';
import { emptyCareer, type MatchRecord, RECENT_MAX, recordMatch, sanitizeCareer } from './career.ts';

const match = (over: Partial<MatchRecord> = {}): MatchRecord => ({
  at: '2026-10-02T12:00:00.000Z',
  mode: 'team-deathmatch',
  aircraftId: 'kestrel',
  result: 'win',
  kills: 3,
  deaths: 1,
  sentinels: 0,
  missilesFired: 6,
  missileHits: 2,
  gunHits: 14,
  damage: 260,
  airborneS: 540,
  distanceM: 120000,
  bestStreak: 2,
  longestLifeS: 300,
  topSpeedMs: 420,
  jets: { kestrel: { kills: 3, deaths: 1 } },
  teamSize: 2,
  difficulty: 'veteran',
  ...over,
});

describe('career records (revision 17)', () => {
  it('adds up totals, modes and jets match by match', () => {
    let c = emptyCareer();
    c = recordMatch(c, match()).career;
    c = recordMatch(c, match({ result: 'loss', kills: 1, deaths: 4, mode: 'strike', aircraftId: 'condor', jets: { kestrel: { kills: 1, deaths: 2 }, condor: { kills: 0, deaths: 2 } } })).career;
    c = recordMatch(c, match({ result: 'draw', kills: 0, deaths: 0, jets: {} })).career;
    expect([c.matches, c.wins, c.losses, c.draws]).toEqual([3, 1, 1, 1]);
    expect([c.kills, c.deaths, c.missilesFired, c.gunHits]).toEqual([4, 5, 18, 42]);
    expect(c.modes).toEqual({ 'team-deathmatch': { matches: 2, wins: 1 }, strike: { matches: 1, wins: 0 } });
    // A jet counts a match for every match it was flown in, with its own kills and deaths.
    expect(c.jets).toEqual({ kestrel: { matches: 3, kills: 4, deaths: 3 }, condor: { matches: 1, kills: 0, deaths: 2 } });
  });

  it('keeps personal bests and says which ones a match beat', () => {
    // The first values are records, but nothing was beaten.
    const first = recordMatch(emptyCareer(), match());
    expect(first.newBests).toEqual([]);
    expect(Object.keys(first.career.bests)).toEqual(['kills', 'streak', 'damage', 'life', 'speed']);
    const second = recordMatch(first.career, match({ kills: 5, bestStreak: 2, damage: 100, topSpeedMs: 500, aircraftId: 'shade', at: 'later' }));
    expect(second.newBests).toEqual(['kills', 'speed']);
    expect(second.career.bests.kills).toEqual({ value: 5, aircraftId: 'shade', mode: 'team-deathmatch', at: 'later' });
    expect(second.career.bests.streak?.value).toBe(2);
    // Values under 1 never make a best.
    const none = recordMatch(emptyCareer(), match({ kills: 0, bestStreak: 0, damage: 0.4, longestLifeS: 0.6, topSpeedMs: 0 }));
    expect(none.career.bests).toEqual({});
  });

  it('lists the latest matches first, at most ten, without touching the career it was given', () => {
    let c = emptyCareer();
    for (let i = 0; i < 12; i++) c = recordMatch(c, match({ kills: i, at: `m${i}` })).career;
    expect(c.recent).toHaveLength(RECENT_MAX);
    expect(c.recent[0]).toMatchObject({ at: 'm11', kills: 11, result: 'win', teamSize: 2, difficulty: 'veteran' });
    const before = JSON.stringify(c);
    recordMatch(c, match());
    expect(JSON.stringify(c)).toBe(before);
  });

  it('reads damaged or foreign storage as a valid career', () => {
    for (const raw of [null, 7, 'x', [], { matches: 'many', kills: -3, damage: Infinity, modes: 5, jets: { kestrel: { matches: 2, kills: 'a' } }, bests: { kills: { value: 4 }, speed: { value: -1 } }, recent: [{ result: 'win', kills: 2 }, { result: 'maybe' }, 9] }]) {
      const c = sanitizeCareer(raw);
      expect(c.matches).toBe(0);
      expect(Number.isFinite(c.damage)).toBe(true);
    }
    const c = sanitizeCareer({ kills: 9, jets: { kestrel: { matches: 2, kills: 'a' } }, bests: { kills: { value: 4 }, speed: { value: -1 } }, recent: [{ result: 'win', kills: 2 }, { result: 'maybe' }, 9] });
    expect(c.kills).toBe(9);
    expect(c.jets).toEqual({ kestrel: { matches: 2, kills: 0, deaths: 0 } });
    expect(c.bests).toEqual({ kills: { value: 4, aircraftId: '', mode: '', at: '' } });
    expect(c.recent).toEqual([{ at: '', mode: '', aircraftId: '', result: 'win', kills: 2, deaths: 0, teamSize: 1, difficulty: '' }]);
  });
});
