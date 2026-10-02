import { describe, expect, it } from 'vitest';
import { MatchStats } from './match-stats.ts';

describe('match statistics (M5)', () => {
  it('adds up damage, hits, launches and Sentinels per pilot from the events', () => {
    const s = new MatchStats();
    const support = (id: number) => id === 50;
    s.onEvent({ type: 'missileLaunched', missileId: 1, shooterId: 3, targetId: 7, kind: 'dart' }, support);
    s.onEvent({ type: 'missileLaunched', missileId: 2, shooterId: 3, targetId: 7, kind: 'lance' }, support);
    s.onEvent({ type: 'hit', aircraftId: 7, attackerId: 3, weapon: 'missile', damage: 85 }, support);
    s.onEvent({ type: 'hit', aircraftId: 7, attackerId: 3, weapon: 'cannon', damage: 10.4 }, support);
    s.onEvent({ type: 'hit', aircraftId: 3, attackerId: null, weapon: 'cannon', damage: 5 }, support);
    s.onEvent({ type: 'destroyed', aircraftId: 50, cause: 'missile', killerId: 3 }, support);
    s.onEvent({ type: 'destroyed', aircraftId: 7, cause: 'missile', killerId: 3 }, support);
    expect(s.of(3)).toEqual({ damage: 95.4, missilesFired: 2, missileHits: 1, gunHits: 1, sentinels: 1 });
    expect(s.of(7)).toEqual({ damage: 0, missilesFired: 0, missileHits: 0, gunHits: 0, sentinels: 0 });
    s.reset();
    expect(s.of(3).damage).toBe(0);
  });

  it('logs the local flight: top speed, max G, time in the air and distance', () => {
    const s = new MatchStats();
    s.sampleFlight(true, true, 60, 1, 1);
    s.sampleFlight(true, false, 300, 7.5, 2);
    s.sampleFlight(false, false, 900, 12, 1);
    expect(s.flight).toEqual({ topSpeedMs: 300, maxG: 7.5, airborneS: 2, distanceM: 660, longestLifeS: 3 });
  });

  it('keeps the longest life, the best kill streak and kills and deaths per jet', () => {
    const s = new MatchStats();
    s.sampleFlight(true, false, 200, 1, 40);
    s.sampleFlight(false, false, 0, 0, 1);
    s.sampleFlight(true, false, 200, 1, 25);
    expect(s.flight.longestLifeS).toBe(40);
    s.localKill('kestrel');
    s.localKill('kestrel');
    s.localDeath('kestrel');
    s.localKill('condor');
    expect(s.bestStreak).toBe(2);
    expect(Object.fromEntries(s.jets)).toEqual({ kestrel: { kills: 2, deaths: 1 }, condor: { kills: 1, deaths: 0 } });
    s.reset();
    expect(s.bestStreak).toBe(0);
    expect(s.jets.size).toBe(0);
    expect(s.flight.longestLifeS).toBe(0);
  });
});
