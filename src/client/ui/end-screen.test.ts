import { describe, expect, it } from 'vitest';
import type { ModeStatus } from '../../shared/modes/mode.ts';
import { matchResult } from './end-screen.ts';

const status = (winner: ModeStatus['winner']): ModeStatus => ({ modeId: 'team-deathmatch', label: 'Team Deathmatch', scores: { usa: 15, russia: 9 }, timeLeftS: 30, winner });

describe('matchResult', () => {
  it('reports victory, defeat and draws for the local team', () => {
    expect(matchResult(status('usa'), 'usa')).toEqual({ title: 'Victory', detail: 'USA 15 – 9 Russia' });
    expect(matchResult(status('usa'), 'russia')).toEqual({ title: 'Defeat', detail: 'Russia 9 – 15 USA' });
    expect(matchResult(status('draw'), 'russia').title).toBe('Draw');
  });
});
