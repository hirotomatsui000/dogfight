import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { AirSuperiorityMode } from '../modes/air-superiority.ts';
import { TeamObjectiveMode } from '../modes/team-objective.ts';
import type { ControlInput } from '../physics/controls.ts';
import { TICK_RATE, World } from '../world/world.ts';
import { DIFFICULTIES } from './difficulty.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const none = new Map<number, ControlInput>();

describe('bots in Air Superiority (M5)', () => {
  it('a lone bot takes all three zones in turn', () => {
    const mode = new AirSuperiorityMode();
    const w = new World({ map, terrain, mode, seed: 5 });
    w.addAircraft({ callsign: 'B', team: 'usa', aircraftId: 'kestrel', bot: DIFFICULTIES.veteran });
    let owned = 0;
    for (let t = 0; t < 5 * 60 * TICK_RATE && owned < 3; t++) {
      w.step(none);
      if (t % 60 === 0) owned = (mode.status(w).zones ?? []).filter((z) => z.owner === 'usa').length;
    }
    expect(owned).toBe(3);
  }, 60_000);

  it('two sides of bots contest the zones and score', () => {
    const mode = new AirSuperiorityMode();
    const w = new World({ map, terrain, mode, seed: 11 });
    for (let i = 0; i < 2; i++) {
      w.addAircraft({ callsign: `U${i}`, team: 'usa', aircraftId: 'condor', bot: DIFFICULTIES.veteran });
      w.addAircraft({ callsign: `R${i}`, team: 'russia', aircraftId: 'yastreb', bot: DIFFICULTIES.veteran });
    }
    for (let t = 0; t < 4 * 60 * TICK_RATE; t++) w.step(none);
    const s = mode.status(w);
    expect((s.scores?.usa ?? 0) + (s.scores?.russia ?? 0)).toBeGreaterThan(20);
    expect((s.zones ?? []).filter((z) => z.owner !== null).length).toBeGreaterThanOrEqual(2);
  }, 60_000);
});

describe('bots in Team Objective (M5)', () => {
  it('hunt down an undefended Sentinel', () => {
    const mode = new TeamObjectiveMode();
    const w = new World({ map, terrain, mode, seed: 9 });
    for (let i = 0; i < 2; i++) w.addAircraft({ callsign: `U${i}`, team: 'usa', aircraftId: 'condor', bot: DIFFICULTIES.ace });
    let destroyed = 0;
    for (let t = 0; t < 6 * 60 * TICK_RATE && destroyed === 0; t++) {
      w.step(none);
      if (t % 60 === 0) destroyed = mode.status(w).objective?.sentinelsDestroyed.usa ?? 0;
    }
    expect(destroyed).toBeGreaterThan(0);
    expect(mode.status(w).scores?.usa).toBeGreaterThanOrEqual(20);
  }, 60_000);
});
