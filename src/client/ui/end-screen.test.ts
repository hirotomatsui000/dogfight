import { describe, expect, it } from 'vitest';
import type { ModeStatus, StrikeStatus } from '../../shared/modes/mode.ts';
import { matchResult, modeSummary } from './end-screen.ts';

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

  it('adds how the objective went in Air Superiority and Team Objective (M5)', () => {
    const zones = (['A', 'B', 'C'] as const).map((id, i) => ({ id, x: 0, z: 0, radiusM: 4000, floorM: 1000, ceilingM: 7000, progress: 0, owner: ([null, 'usa', 'russia'] as const)[i], inside: { usa: 0, russia: 0 } }));
    const as: ModeStatus = { modeId: 'air-superiority', label: 'Air Superiority', scores: { usa: 300, russia: 240 }, timeLeftS: 80, winner: 'usa', zones };
    expect(matchResult(as, 'usa')).toEqual({ title: 'Victory', detail: 'USA 300 – 240 Russia', note: 'Zones at the end: A nobody · B USA · C Russia' });
    const to: ModeStatus = {
      modeId: 'team-objective',
      label: 'Team Objective',
      scores: { usa: 44, russia: 61 },
      timeLeftS: 10,
      winner: 'russia',
      objective: { sentinels: [], datalinkDownS: { usa: 0, russia: 0 }, sentinelsDestroyed: { usa: 1, russia: 2 } },
    };
    expect(modeSummary(to, 'usa')).toBe('Sentinels shot down: USA 1 · Russia 2');
    expect(modeSummary(status('usa'), 'usa')).toBeNull();
  });
});
