import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildTerrain, type StrikeLayout } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { BOMB_ANVIL } from '../data/weapons.ts';
import { StrikeMode } from '../modes/strike.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { predictImpact } from '../weapons/bomb.ts';
import type { AircraftEntity } from './entities.ts';
import type { GameEvent } from './events.ts';
import type { GroundTarget } from './ground-targets.ts';
import { DT, TICK_RATE, World } from './world.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const NO_INPUTS = new Map<number, ControlInput>();
const layout = (): StrikeLayout => {
  if (!map.strike) throw new Error('the test range needs a Strike layout');
  return map.strike;
};
const strikeWorld = (mode = new StrikeMode()) => new World({ map, terrain, mode, seed: 1 });
const attacker = (w: World) => w.addAircraft({ callsign: 'R', team: 'russia', aircraftId: 'kobchik' });
const press = (a: AircraftEntity) => new Map([[a.id, { ...neutralInput(0.9), dropBomb: true }]]);

function run(w: World, ticks: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    w.step(NO_INPUTS);
    events.push(...w.drainEvents());
  }
  return events;
}

/** Level eastbound flight 1,500 m above the target, placed so a bomb released now lands on it. */
function lineUp(a: AircraftEntity, t: GroundTarget): void {
  a.flight = createFlightState({ position: new Vector3(t.pos.x - 10000, t.pos.y + 1500, t.pos.z), headingRad: Math.PI / 2, speed: 250, throttle: 0.9 });
  for (let i = 0; i < 2; i++) {
    const impact = predictImpact(a.flight.pos, a.flight.vel, BOMB_ANVIL, terrain, DT, new Vector3());
    if (!impact) throw new Error('the bomb would not land');
    a.flight.pos.x += t.pos.x - impact.x;
    a.flight.pos.z += t.pos.z - impact.z;
  }
  a.prevPos.copy(a.flight.pos);
}

describe('Strike in the World', () => {
  it('places the three targets and spawns each team at its Strike spawn with its bomb load', () => {
    const w = strikeWorld();
    expect(w.groundTargetList().map((t) => t.id)).toEqual(['A', 'B', 'C']);
    for (const t of w.groundTargetList()) expect(t.pos.y).toBeCloseTo(terrain.surfaceAt(t.pos.x, t.pos.z), 6);
    const ru = attacker(w);
    const us = w.addAircraft({ callsign: 'U', team: 'usa', aircraftId: 'kestrel' });
    expect(ru.flight.pos.x).toBeCloseTo(layout().spawns.russia.x, 3);
    expect(us.flight.pos.x).toBeCloseTo(layout().spawns.usa.x, 3);
    expect([ru.stores.bombs, ru.bombLoad, us.stores.bombs, us.bombLoad]).toEqual([8, 8, 0, 0]);
  });

  it('releases one bomb per press, no faster than one per 0.25 s', () => {
    const w = strikeWorld();
    const ru = attacker(w);
    w.drainEvents();
    w.step(press(ru));
    w.step(press(ru));
    expect(w.bombList()).toHaveLength(1);
    expect(ru.stores.bombs).toBe(7);
    expect(w.drainEvents()).toContainEqual({ type: 'bombReleased', bombId: 1, aircraftId: ru.id });
    run(w, Math.round(0.25 * TICK_RATE));
    w.step(press(ru));
    expect(w.bombList()).toHaveLength(2);
  });

  it('damages and destroys a target with well-aimed bombs, crediting the bomber', () => {
    const w = strikeWorld();
    const ru = attacker(w);
    const b = w.groundTargetList()[1];
    const events: GameEvent[] = [];
    for (let i = 0; i < 3; i++) {
      lineUp(ru, b);
      w.step(press(ru));
      events.push(...run(w, 30 * TICK_RATE));
    }
    expect(b.destroyed).toBe(true);
    expect(events.filter((e) => e.type === 'bombImpact')).toHaveLength(3);
    expect(events).toContainEqual({ type: 'targetDestroyed', targetId: 'B', attackerId: ru.id });
    const hits = events.filter((e) => e.type === 'targetHit');
    expect(hits.length).toBe(3);
    expect(hits[0]).toMatchObject({ targetId: 'B', attackerId: ru.id, damage: 40 });
  });

  it('lets a falling bomb count after its aircraft is shot down', () => {
    const w = strikeWorld();
    const ru = attacker(w);
    const b = w.groundTargetList()[1];
    lineUp(ru, b);
    w.step(press(ru));
    w.applyDamage(ru, 1000, null, 'cannon');
    expect(ru.alive).toBe(false);
    run(w, 30 * TICK_RATE);
    expect(b.hp).toBe(b.maxHp - 40);
  });

  it('ignores bombs that land after the match has ended', () => {
    const w = strikeWorld(new StrikeMode({ timeLimitS: 1 }));
    const ru = attacker(w);
    const b = w.groundTargetList()[1];
    lineUp(ru, b);
    w.step(press(ru));
    const events = run(w, 30 * TICK_RATE);
    expect(w.mode.status(w).winner).toBe('usa');
    expect(events.some((e) => e.type === 'bombImpact')).toBe(true);
    expect(events.some((e) => e.type === 'targetHit')).toBe(false);
    expect(b.hp).toBe(b.maxHp);
  });

  it('gives every new aircraft a full bomb load', () => {
    const w = strikeWorld();
    const ru = attacker(w);
    w.step(press(ru));
    expect(ru.stores.bombs).toBe(7);
    w.applyDamage(ru, 1000, null, 'cannon');
    run(w, 6 * TICK_RATE);
    expect([ru.alive, ru.stores.bombs]).toEqual([true, 8]);
  });

  it('does not respawn a team that has no aircraft left', () => {
    const w = strikeWorld(new StrikeMode({ aircraftPerTeam: 1 }));
    const ru = attacker(w);
    w.applyDamage(ru, 1000, null, 'cannon');
    run(w, 10 * TICK_RATE);
    expect(ru.alive).toBe(false);
  });

  it('keeps other modes free of ground targets and bombs', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 1 });
    expect(w.groundTargetList()).toEqual([]);
    const ru = attacker(w);
    expect(ru.flight.pos.x).toBeCloseTo(map.spawns.russia.x, 3);
    w.step(press(ru));
    expect([ru.stores.bombs, w.bombList().length]).toEqual([0, 0]);
  });
});
