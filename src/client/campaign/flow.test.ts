import { describe, expect, it } from 'vitest';
import { START_HOURS } from '../../shared/world/time-of-day.ts';
import { progressLine } from '../ui/campaign-sheet.ts';
import { campaignOutcome, campaignStart, missionFacts, missionHeading } from './flow.ts';
import { CAMPAIGN, missionById } from './missions.ts';
import { emptyCampaign, missionProgress, recordAttempt } from './progress.ts';

const pilot = { aircraftId: 'kestrel', callsign: 'Viper', controlMode: 'mouse-aim' as const };

describe('campaign flow (revision 18)', () => {
  it('turns a mission into the match it flies', () => {
    const m = missionById('outnumbered')!;
    expect(campaignStart(m, 'usa', pilot)).toEqual({
      aircraftId: 'kestrel',
      callsign: 'Viper',
      controlMode: 'mouse-aim',
      mission: 'team-deathmatch',
      difficulty: 'rookie',
      wingmenDifficulty: 'veteran',
      map: 'lechovia',
      start: 'air',
      environment: { weather: 'scattered', startHour: START_HOURS.dusk, clockRunning: false },
      teamSize: 2,
      enemies: 3,
      scoreLimit: 6,
      campaign: { missionId: 'outnumbered' },
    });
  });

  it('uses each side’s own numbers and swaps a jet of the other side for the suggested one', () => {
    const strike = missionById('strike')!;
    const russia = campaignStart(strike, 'russia', pilot);
    expect(russia).toMatchObject({ mission: 'strike', map: 'test-range', aircraftId: 'sapsan', teamSize: 1, enemies: 1, scoreLimit: undefined });
    expect(campaignStart(strike, 'usa', pilot)).toMatchObject({ aircraftId: 'kestrel', teamSize: 2, enemies: 1, difficulty: 'ace' });
    expect(campaignStart(strike, 'usa', { ...pilot, aircraftId: 'nope' }).aircraftId).toBe('kestrel');
  });

  it('names the mission and lists its facts', () => {
    expect(missionHeading(CAMPAIGN[2])).toBe('Mission 3 of 9 · The Lake District');
    expect(missionFacts(missionById('first-sortie')!, 'usa')).toEqual(['Dogfight', 'Lechovia · Day · Clear', '1 v 1 · Rookie opponents', 'First to 3 kills']);
    expect(missionFacts(missionById('storm-front')!, 'russia')).toEqual([
      'Air Superiority',
      'Lechovia · Day · Rain · Runway start',
      '4 v 4 · Ace wingmen · Ace opponents',
      'First to 200 points',
    ]);
    expect(missionFacts(missionById('strike')!, 'usa')).toContain('9 minutes');
  });

  it('opens the next mission after a win, with its suggested jet unless the pilot chose their own', () => {
    const [first, second] = CAMPAIGN;
    const won = campaignOutcome(emptyCampaign(), 'usa', first, first.jet.usa, true, 3, 1);
    expect(won.title).toBe('Mission complete');
    expect(won.kicker).toBe('Campaign · Mission 1 of 9 · First Sortie');
    expect(won.againLabel).toBe('Next mission');
    expect(won.highlights).toEqual(['Cleared on the first attempt · 1 of 9']);
    expect(won.next).toEqual({ mission: second, heading: 'Next · Mission 2 of 9 · Two-Ship', briefing: second.briefing('usa'), aircraftId: second.jet.usa });
    expect(missionProgress(won.progress, 'usa', first.id).cleared).toBe(true);
    expect(campaignOutcome(emptyCampaign(), 'usa', first, 'condor', true, 3, 1).next?.aircraftId).toBe('condor');
  });

  it('offers a retry after a loss or a draw', () => {
    const lost = campaignOutcome(emptyCampaign(), 'russia', CAMPAIGN[0], 'kobchik', false, 1, 3);
    expect([lost.title, lost.againLabel, lost.next, lost.highlights]).toEqual(['Mission failed', 'Retry mission', null, []]);
    expect(missionProgress(lost.progress, 'russia', CAMPAIGN[0].id)).toMatchObject({ cleared: false, attempts: 1 });
    const again = campaignOutcome(lost.progress, 'russia', CAMPAIGN[0], 'kobchik', true, 3, 0);
    expect(again.highlights).toEqual(['Cleared after 2 attempts · 1 of 9']);
  });

  it('completes the campaign on the last mission, and says nothing new on a replay', () => {
    let p = emptyCampaign();
    for (const m of CAMPAIGN.slice(0, -1)) p = recordAttempt(p, 'usa', m.id, true, 1, 0);
    const last = CAMPAIGN[CAMPAIGN.length - 1];
    const done = campaignOutcome(p, 'usa', last, last.jet.usa, true, 4, 1);
    expect([done.title, done.againLabel, done.next]).toEqual(['Campaign complete', 'Fly it again', null]);
    expect(done.highlights).toEqual(['Cleared on the first attempt · 9 of 9', 'Every mission cleared for the USA']);
    const replay = campaignOutcome(done.progress, 'usa', CAMPAIGN[0], CAMPAIGN[0].jet.usa, true, 3, 0);
    expect(replay.highlights).toEqual([]);
    expect(replay.next?.mission).toBe(CAMPAIGN[1]);
  });

  it('describes progress on a mission in one line', () => {
    let p = emptyCampaign();
    expect(progressLine(p, 'usa', 0)).toBe('Not flown yet.');
    expect(progressLine(p, 'usa', 1)).toBe('Clear mission 1 to open this one.');
    p = recordAttempt(p, 'usa', CAMPAIGN[0].id, false, 0, 2);
    expect(progressLine(p, 'usa', 0)).toBe('Not cleared yet · 1 attempt');
    p = recordAttempt(p, 'usa', CAMPAIGN[0].id, true, 4, 1);
    expect(progressLine(p, 'usa', 0)).toBe('Cleared · 2 attempts · most kills 4 · fewest deaths 1');
  });
});
