import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { DEG } from '../math/units.ts';
import { StrikeMode } from '../modes/strike.ts';
import { createFlightState } from '../physics/flight-model.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { GameEvent } from '../world/events.ts';
import { World } from '../world/world.ts';
import { DIFFICULTIES } from './difficulty.ts';
import { runStrikeMatch } from './strike-match.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const NO_INPUTS = new Map();

function place(a: AircraftEntity, x: number, y: number, z: number, headingDeg: number, speed = 250): void {
  a.flight = createFlightState({ position: new Vector3(x, y, z), headingRad: headingDeg * DEG, speed, throttle: 0.88 });
  a.prevPos.copy(a.flight.pos);
  a.history.reset();
}

/** Angle between the horizontal velocity and due west. */
const offWest = (v: Vector3) => new Vector3(v.x, 0, v.z).angleTo(new Vector3(-1, 0, 0));

describe('Strike attacker AI', () => {
  it('drops a two-bomb stick that straddles the target', () => {
    const w = new World({ map, terrain, mode: new StrikeMode(), seed: 1 });
    const ru = w.addAircraft({ callsign: 'R', team: 'russia', aircraftId: 'kobchik', bot: { ...DIFFICULTIES.ace, bombErrorM: 0 } });
    const b = w.groundTargetList()[1];
    place(ru, b.pos.x + 12000, b.pos.y + 1500, b.pos.z, 270);
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 * 60; i++) {
      w.step(NO_INPUTS);
      events.push(...w.drainEvents());
      if (events.filter((e) => e.type === 'bombImpact').length >= 2) break;
    }
    expect(events.filter((e) => e.type === 'bombReleased')).toHaveLength(2);
    expect(b.hp).toBeLessThanOrEqual(b.maxHp - 60);
  });

  it('turns to fight a defender on its tail instead of pressing the run', () => {
    const heading = (chased: boolean) => {
      const w = new World({ map, terrain, mode: new StrikeMode(), seed: 1 });
      const ru = w.addAircraft({ callsign: 'R', team: 'russia', aircraftId: 'kobchik', bot: DIFFICULTIES.veteran });
      place(ru, 8000, 1700, 0, 270);
      if (chased) place(w.addAircraft({ callsign: 'U', team: 'usa', aircraftId: 'kestrel' }), 9500, 1700, 0, 270);
      for (let i = 0; i < 5 * 60; i++) w.step(NO_INPUTS);
      return offWest(ru.flight.vel);
    };
    expect(heading(false)).toBeLessThan(20 * DEG);
    expect(heading(true)).toBeGreaterThan(30 * DEG);
  });

  it('destroys two targets unopposed within 8 minutes (Veteran and Ace, 8 of 10 seeds)', () => {
    for (const profile of [DIFFICULTIES.veteran, DIFFICULTIES.ace]) {
      let wins = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const r = runStrikeMatch(map, terrain, { attacker: profile, defender: null }, seed);
        if (r.winner === 'russia' && r.reason === 'targets-destroyed') wins++;
      }
      expect(wins).toBeGreaterThanOrEqual(8);
    }
  }, 120000);
});
