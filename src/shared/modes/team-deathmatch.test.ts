import { describe, expect, it } from 'vitest';
import type { TeamId } from '../data/aircraft/types.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { ModeContext } from './mode.ts';
import { TeamDeathmatchMode } from './team-deathmatch.ts';

const ctx = (tick: number): ModeContext => ({ tick, tickRate: 60, aircraftList: () => [] });
const victim = (team: TeamId) => ({ team }) as AircraftEntity;

describe('TeamDeathmatchMode', () => {
  it('gives the other team a point for every death, kill or crash', () => {
    const m = new TeamDeathmatchMode();
    m.update(ctx(0));
    m.onAircraftDestroyed(ctx(10), victim('russia'), null, 'crash');
    m.onAircraftDestroyed(ctx(20), victim('russia'), null, 'cannon');
    m.onAircraftDestroyed(ctx(30), victim('usa'), null, 'missile');
    expect(m.status(ctx(30)).scores).toEqual({ usa: 2, russia: 1 });
    expect(m.status(ctx(30)).winner).toBeNull();
    expect(m.combatEnabled).toBe(true);
    expect(m.respawnDelayS).toBe(5);
  });

  it('ends when a team reaches the score limit and stops scoring', () => {
    const m = new TeamDeathmatchMode({ scoreLimit: 2 });
    m.update(ctx(0));
    m.onAircraftDestroyed(ctx(1), victim('usa'), null, 'crash');
    m.onAircraftDestroyed(ctx(2), victim('usa'), null, 'crash');
    m.onAircraftDestroyed(ctx(3), victim('usa'), null, 'crash');
    expect(m.status(ctx(3))).toMatchObject({ winner: 'russia', scores: { usa: 0, russia: 2 } });
  });

  it('counts down from the first update and decides on time', () => {
    const m = new TeamDeathmatchMode({ timeLimitS: 10 });
    m.update(ctx(600));
    expect(m.status(ctx(900)).timeLeftS).toBeCloseTo(5, 9);
    m.onAircraftDestroyed(ctx(900), victim('usa'), null, 'crash');
    m.update(ctx(1200));
    expect(m.status(ctx(1200))).toMatchObject({ winner: 'russia', timeLeftS: 0 });
  });

  it('calls a draw on equal scores at the time limit', () => {
    const m = new TeamDeathmatchMode({ timeLimitS: 1 });
    m.update(ctx(0));
    m.update(ctx(60));
    expect(m.status(ctx(60)).winner).toBe('draw');
    expect(m.status(ctx(60)).label).toBe('Team Deathmatch');
  });
});
