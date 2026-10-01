import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { TeamId } from '../data/aircraft/types.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { GroundTarget } from '../world/ground-targets.ts';
import type { ModeContext } from './mode.ts';
import { StrikeMode } from './strike.ts';

const target = (id: string, destroyed = false): GroundTarget => ({ id, kind: 'depot', label: id, pos: new Vector3(), maxHp: 100, hp: destroyed ? 0 : 100, destroyed });
const standing = () => [target('A'), target('B'), target('C')];
const ctx = (tick: number, targets: GroundTarget[] = standing()): ModeContext => ({ tick, tickRate: 60, aircraftList: () => [], groundTargetList: () => targets });
const lose = (m: StrikeMode, team: TeamId, times = 1) => {
  for (let i = 0; i < times; i++) m.onAircraftDestroyed(ctx(0), { team } as AircraftEntity);
};

describe('StrikeMode', () => {
  it('starts with 8 minutes, 4 aircraft a side, two targets to win and bombs only for Russia', () => {
    const m = new StrikeMode();
    m.update(ctx(0));
    expect(m.status(ctx(0))).toMatchObject({
      modeId: 'strike',
      label: 'Strike',
      scores: null,
      timeLeftS: 480,
      winner: null,
      strike: { attacker: 'russia', defender: 'usa', aircraftLeft: { usa: 4, russia: 4 }, targetsDestroyed: 0, targetsToWin: 2, reason: null },
    });
    expect([m.bombLoad('russia'), m.bombLoad('usa')]).toEqual([8, 0]);
    expect([m.combatEnabled, m.respawnDelayS]).toEqual([true, 5]);
  });

  it('gives Russia the win once two targets are destroyed', () => {
    const m = new StrikeMode();
    m.update(ctx(0));
    m.update(ctx(10, [target('A', true), target('B'), target('C')]));
    expect(m.status(ctx(10)).winner).toBeNull();
    const two = [target('A', true), target('B'), target('C', true)];
    m.update(ctx(20, two));
    expect(m.status(ctx(20, two))).toMatchObject({ winner: 'russia', strike: { reason: 'targets-destroyed', targetsDestroyed: 2 } });
  });

  it('gives the USA the win when the time runs out', () => {
    const m = new StrikeMode();
    m.update(ctx(0));
    m.update(ctx(480 * 60));
    expect(m.status(ctx(480 * 60))).toMatchObject({ winner: 'usa', timeLeftS: 0, strike: { reason: 'targets-held' } });
  });

  it('counts a target destroyed in the final tick for Russia', () => {
    const m = new StrikeMode();
    m.update(ctx(0));
    m.update(ctx(480 * 60, [target('A', true), target('B', true), target('C')]));
    expect(m.status(ctx(480 * 60)).winner).toBe('russia');
  });

  it('ends the match when a team loses its 4th aircraft', () => {
    const m = new StrikeMode();
    m.update(ctx(0));
    lose(m, 'usa', 3);
    m.update(ctx(1));
    expect(m.status(ctx(1))).toMatchObject({ winner: null, strike: { aircraftLeft: { usa: 1, russia: 4 } } });
    lose(m, 'usa');
    m.update(ctx(2));
    expect(m.status(ctx(2))).toMatchObject({ winner: 'russia', strike: { reason: 'out-of-aircraft', aircraftLeft: { usa: 0, russia: 4 } } });
  });

  it('gives the USA the win when both teams lose their last aircraft in the same tick', () => {
    const m = new StrikeMode();
    m.update(ctx(0));
    lose(m, 'usa', 3);
    lose(m, 'russia', 3);
    m.update(ctx(1));
    lose(m, 'usa');
    lose(m, 'russia');
    m.update(ctx(2));
    expect(m.status(ctx(2))).toMatchObject({ winner: 'usa', strike: { reason: 'out-of-aircraft' } });
  });

  it('stops respawns for a team with no aircraft left and ignores losses after the end', () => {
    const m = new StrikeMode();
    m.update(ctx(0));
    lose(m, 'russia', 3);
    expect(m.canRespawn('russia')).toBe(true);
    lose(m, 'russia');
    expect([m.canRespawn('russia'), m.canRespawn('usa')]).toEqual([false, true]);
    m.update(ctx(1));
    lose(m, 'usa', 4);
    expect(m.status(ctx(1))).toMatchObject({ winner: 'usa', strike: { aircraftLeft: { usa: 4 } } });
  });

  it("takes spawns and targets from the map's Strike layout, and needs one", () => {
    const m = new StrikeMode();
    const map = createTestRange(1);
    expect(m.spawnPoint(map, 'russia')).toBe(map.strike?.spawns.russia);
    expect(m.groundTargets(map).map((t) => t.id)).toEqual(['A', 'B', 'C']);
    expect(() => m.spawnPoint({ ...map, strike: undefined }, 'usa')).toThrow(/no Strike layout/);
  });
});
