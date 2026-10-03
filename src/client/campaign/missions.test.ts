import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../shared/ai/difficulty.ts';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { MAP_IDS } from '../../shared/data/maps/registry.ts';
import { START_HOURS } from '../../shared/world/time-of-day.ts';
import { WEATHER } from '../../shared/world/weather.ts';
import { CAMPAIGN, missionById, missionHour, missionIndex, missionSetup } from './missions.ts';

const SIDES: readonly TeamId[] = ['usa', 'russia'];

describe('campaign missions (revision 18)', () => {
  it('has nine missions with unique ids, in order', () => {
    expect(CAMPAIGN).toHaveLength(9);
    expect(new Set(CAMPAIGN.map((m) => m.id)).size).toBe(CAMPAIGN.length);
    CAMPAIGN.forEach((m, i) => {
      expect(missionIndex(m.id)).toBe(i);
      expect(missionById(m.id)).toBe(m);
    });
    expect(missionById('nope')).toBeUndefined();
  });

  it('flies every mission with a real map, weather, time, skills and jets of the right side', () => {
    for (const m of CAMPAIGN) {
      expect(MAP_IDS).toContain(m.map);
      expect(WEATHER[m.weather]).toBeDefined();
      expect(missionHour(m)).toBe(START_HOURS[m.time]);
      // Strike is laid out on the test range, which has no runways.
      if (m.mode === 'strike') expect([m.map, m.start]).toEqual(['test-range', 'air']);
      if (m.start === 'runway') expect(m.map).toBe('lechovia');
      for (const side of SIDES) {
        expect(getAircraft(m.jet[side]).team).toBe(side);
        const k = missionSetup(m, side);
        expect(k.allies).toBeGreaterThanOrEqual(1);
        expect(k.allies).toBeLessThanOrEqual(4);
        expect(k.enemies).toBeGreaterThanOrEqual(1);
        expect(k.enemies).toBeLessThanOrEqual(4);
        expect(DIFFICULTIES[k.difficulty]).toBeDefined();
        expect(DIFFICULTIES[k.wingmenDifficulty]).toBeDefined();
        if (m.mode !== 'strike') expect(k.scoreLimit).toBeGreaterThan(0);
      }
    }
  });

  it('briefs each side in its own words, with no placeholders left', () => {
    for (const m of CAMPAIGN) {
      const usa = m.briefing('usa');
      const russia = m.briefing('russia');
      expect(usa).not.toMatch(/[{}]/);
      expect(russia).not.toMatch(/[{}]/);
      expect(usa.length).toBeGreaterThan(40);
    }
    expect(missionById('first-sortie')!.briefing('usa')).toContain('A single Russian fighter');
    expect(missionById('first-sortie')!.briefing('russia')).toContain('A single American fighter');
    expect(missionById('last-light')!.briefing('russia')).toContain('belong to Russia.');
    expect(missionById('last-light')!.briefing('usa')).toContain('belong to the USA.');
  });

  it('starts gently and ends with aces', () => {
    const first = missionSetup(CAMPAIGN[0], 'usa');
    expect([first.allies, first.enemies, first.difficulty]).toEqual([1, 1, 'rookie']);
    const last = missionSetup(CAMPAIGN[CAMPAIGN.length - 1], 'russia');
    expect([last.allies, last.enemies, last.difficulty]).toEqual([4, 4, 'ace']);
  });

  it('gives one side other numbers where the mode favours the other', () => {
    const strike = missionById('strike')!;
    expect(missionSetup(strike, 'usa')).toMatchObject({ allies: 2, enemies: 1, difficulty: 'ace' });
    expect(missionSetup(strike, 'russia')).toMatchObject({ allies: 1, enemies: 1, difficulty: 'veteran' });
    expect(missionSetup(missionById('eyes-in-the-sky')!, 'usa').difficulty).toBe('rookie');
    expect(missionSetup(missionById('eyes-in-the-sky')!, 'russia').difficulty).toBe('veteran');
    expect(missionById('strike')!.briefing('usa')).not.toBe(missionById('strike')!.briefing('russia'));
  });
});
