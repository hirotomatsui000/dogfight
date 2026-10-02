import { describe, expect, it } from 'vitest';
import { emptyCareer, type MatchRecord, recordMatch } from '../career.ts';
import { aircraftName, bestLine, bestRows, careerTotals, formatBestValue, formatDate, missionLabel, recentLabel } from './records-format.ts';

const match = (over: Partial<MatchRecord> = {}): MatchRecord => ({
  at: '2026-10-02T12:34:56.000Z',
  mode: 'air-superiority',
  aircraftId: 'kestrel',
  result: 'win',
  kills: 4,
  deaths: 2,
  sentinels: 1,
  missilesFired: 8,
  missileHits: 3,
  gunHits: 20,
  damage: 1234.4,
  airborneS: 3900,
  distanceM: 1_234_000,
  bestStreak: 3,
  longestLifeS: 372,
  topSpeedMs: 400,
  jets: { kestrel: { kills: 4, deaths: 2 } },
  teamSize: 4,
  difficulty: 'ace',
  ...over,
});

describe('records formatting (revision 17)', () => {
  it('formats each kind of best, speed in the units of the jet it was set in', () => {
    expect(formatBestValue('kills', 7, 'metric')).toBe('7');
    expect(formatBestValue('damage', 1234.4, 'metric')).toBe('1,234');
    expect(formatBestValue('life', 372, 'metric')).toBe('6:12');
    expect(formatBestValue('speed', 400, 'metric')).toBe('1,440 km/h');
    expect(formatBestValue('speed', 400, 'imperial')).toBe('778 kt');
    expect(bestLine('speed', 400, 'kestrel')).toBe('Top speed: 778 kt');
    expect(bestLine('streak', 3, 'kobchik')).toBe('Longest kill streak: 3');
  });

  it('sums up a career', () => {
    const c = recordMatch(emptyCareer(), match()).career;
    const totals = Object.fromEntries(careerTotals(c));
    expect(totals.Matches).toBe('1 (1 won · 0 lost · 0 drawn)');
    expect(totals['Win rate']).toBe('100%');
    expect(totals['Kills per death']).toBe('2.00');
    expect(totals.Missiles).toBe('8 fired · 3 hit (38%)');
    expect(totals['Time in the air']).toBe('1 h 5 min');
    expect(totals['Distance flown']).toBe('1,234 km');
    expect(Object.fromEntries(careerTotals(emptyCareer()))['Kills per death']).toBe('—');
  });

  it('lists bests with the jet and day, and recent matches with their setup', () => {
    const c = recordMatch(emptyCareer(), match()).career;
    expect(bestRows(c)[0]).toEqual(['Most kills in a match', '4', 'Kestrel', '2026-10-02']);
    expect(bestRows(c)).toHaveLength(5);
    expect(recentLabel(c.recent[0])).toBe('Air Superiority · 4 v 4 · Ace');
  });

  it('copes with ids and dates from records it no longer knows', () => {
    expect(aircraftName('retired-jet')).toBe('retired-jet');
    expect(missionLabel('team-deathmatch')).toBe('Dogfight');
    expect(missionLabel('old-mode')).toBe('old-mode');
    expect(formatDate('garbage')).toBe('');
  });
});
