import { describe, expect, it } from 'vitest';
import type { ModeStatus, StrikeStatus } from '../../shared/modes/mode.ts';
import { matchResult } from './end-screen.ts';

const status = (winner: ModeStatus['winner']): ModeStatus => ({ modeId: 'team-deathmatch', label: 'Team Deathmatch', scores: { usa: 15, russia: 9 }, timeLeftS: 30, winner });
const strike = (winner: 'usa' | 'russia', reason: StrikeStatus['reason']): ModeStatus => ({
  modeId: 'strike',
  label: 'Strike',
  scores: null,
  timeLeftS: 0,
  winner,
  strike: { attacker: 'russia', defender: 'usa', aircraftLeft: { usa: 2, russia: 0 }, targetsDestroyed: 1, targetsToWin: 2, reason },
});

describe('matchResult', () => {
  it('reports victory, defeat and draws for the local team', () => {
    expect(matchResult(status('usa'), 'usa')).toEqual({ title: 'Victory', detail: 'USA 15 – 9 Russia', note: null });
    expect(matchResult(status('usa'), 'russia')).toEqual({ title: 'Defeat', detail: 'Russia 9 – 15 USA', note: null });
    expect(matchResult(status('draw'), 'russia').title).toBe('Draw');
  });

  it('leads a Strike result with the reason and lists the targets destroyed', () => {
    expect(matchResult(strike('usa', 'targets-held'), 'usa', ['A (Supply depot)'])).toEqual({ title: 'Victory', detail: 'TARGETS HELD', note: 'Destroyed: A (Supply depot)' });
    expect(matchResult(strike('russia', 'targets-destroyed'), 'usa', ['A (Supply depot)', 'C (Fuel depot)']).detail).toBe('TARGETS DESTROYED');
    expect(matchResult(strike('usa', 'out-of-aircraft'), 'russia')).toEqual({ title: 'Defeat', detail: 'RUSSIA OUT OF AIRCRAFT', note: 'No targets destroyed' });
  });
});
