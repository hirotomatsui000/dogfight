import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from './missions.ts';
import { clearedCount, emptyCampaign, isUnlocked, missionProgress, nextMissionIndex, recordAttempt, sanitizeCampaign } from './progress.ts';

const [first, second, third] = CAMPAIGN;

describe('campaign progress (revision 18)', () => {
  it('opens only the first mission at the start', () => {
    const p = emptyCampaign();
    expect(isUnlocked(p, 'usa', 0)).toBe(true);
    expect(isUnlocked(p, 'usa', 1)).toBe(false);
    expect(isUnlocked(p, 'usa', -1)).toBe(false);
    expect(isUnlocked(p, 'usa', CAMPAIGN.length)).toBe(false);
    expect(nextMissionIndex(p, 'usa')).toBe(0);
    expect(clearedCount(p, 'usa')).toBe(0);
  });

  it('counts failed attempts, and a win clears the mission and opens the next', () => {
    let p = recordAttempt(emptyCampaign(), 'usa', first.id, false, 2, 3);
    expect(missionProgress(p, 'usa', first.id)).toEqual({ cleared: false, attempts: 1, bestKills: 0, fewestDeaths: null });
    expect(isUnlocked(p, 'usa', 1)).toBe(false);
    p = recordAttempt(p, 'usa', first.id, true, 3, 2);
    expect(missionProgress(p, 'usa', first.id)).toEqual({ cleared: true, attempts: 2, bestKills: 3, fewestDeaths: 2 });
    expect(isUnlocked(p, 'usa', 1)).toBe(true);
    expect(isUnlocked(p, 'usa', 2)).toBe(false);
    expect(nextMissionIndex(p, 'usa')).toBe(1);
    // Another run: better numbers count, a loss never takes the clear away.
    p = recordAttempt(p, 'usa', first.id, true, 5, 0);
    p = recordAttempt(p, 'usa', first.id, false, 9, 9);
    expect(missionProgress(p, 'usa', first.id)).toEqual({ cleared: true, attempts: 4, bestKills: 5, fewestDeaths: 0 });
  });

  it('keeps each side apart and remembers the side last flown', () => {
    const p = recordAttempt(emptyCampaign(), 'russia', first.id, true, 3, 0);
    expect(p.side).toBe('russia');
    expect(clearedCount(p, 'russia')).toBe(1);
    expect(clearedCount(p, 'usa')).toBe(0);
    expect(isUnlocked(p, 'usa', 1)).toBe(false);
  });

  it('does not change the progress it is given', () => {
    const p = emptyCampaign();
    recordAttempt(p, 'usa', first.id, true, 3, 0);
    expect(p).toEqual(emptyCampaign());
  });

  it('offers the last mission once every one is cleared', () => {
    let p = emptyCampaign();
    for (const m of CAMPAIGN) p = recordAttempt(p, 'usa', m.id, true, 1, 0);
    expect(clearedCount(p, 'usa')).toBe(CAMPAIGN.length);
    expect(nextMissionIndex(p, 'usa')).toBe(CAMPAIGN.length - 1);
  });

  it('reads whatever storage held as valid progress', () => {
    expect(sanitizeCampaign(null)).toEqual(emptyCampaign());
    expect(sanitizeCampaign('junk')).toEqual(emptyCampaign());
    const p = sanitizeCampaign({
      side: 'russia',
      sides: {
        usa: {
          [first.id]: { cleared: true, attempts: 3.7, bestKills: -2, fewestDeaths: 1 },
          [second.id]: { cleared: 'yes', attempts: 'many', fewestDeaths: 0 },
          [third.id]: 'nope',
          'old-mission': { cleared: true, attempts: 1 },
        },
        russia: [],
      },
    });
    expect(p.side).toBe('russia');
    expect(p.sides.usa).toEqual({
      [first.id]: { cleared: true, attempts: 3, bestKills: 0, fewestDeaths: 1 },
      [second.id]: { cleared: false, attempts: 0, bestKills: 0, fewestDeaths: null },
    });
    expect(p.sides.russia).toEqual({});
    expect(sanitizeCampaign({ side: 'mars' }).side).toBe('usa');
  });
});
