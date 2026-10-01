import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { getAircraft } from '../data/aircraft/registry.ts';
import type { TeamId } from '../data/aircraft/types.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { type AircraftEntity, createAircraftEntity } from '../world/entities.ts';
import type { GameEvent } from '../world/events.ts';
import { AirSuperiorityMode, CAPTURE_S, frontZones, insideZone, stepZone } from './air-superiority.ts';
import type { ModeContext, ZoneStatus } from './mode.ts';

const map = createTestRange();
let nextId = 1;
const jet = (team: TeamId, x: number, y: number, z: number): AircraftEntity =>
  createAircraftEntity({
    id: nextId++,
    callsign: 'x',
    team,
    config: getAircraft(team === 'usa' ? 'kestrel' : 'kobchik'),
    isBot: false,
    flight: createFlightState({ position: new Vector3(x, y, z), headingRad: 0, speed: 200 }),
    spawnSlot: 0,
    bombLoad: 0,
  });

function context(aircraft: AircraftEntity[], events: GameEvent[] = []) {
  const c = { tick: 0, tickRate: 60, aircraftList: () => aircraft, groundTargetList: () => [], emit: (e: GameEvent) => events.push(e) };
  return c satisfies ModeContext;
}

const zone = (progress = 0, owner: TeamId | null = null): ZoneStatus => ({
  id: 'B',
  x: 0,
  z: 0,
  radiusM: 4000,
  floorM: 1000,
  ceilingM: 7000,
  progress,
  owner,
  inside: { usa: 0, russia: 0 },
});

describe('Air Superiority zones (spec §13)', () => {
  it('lies three zones on the front between the two spawns, inside the combat area', () => {
    const zones = frontZones(map);
    expect(zones.map((z) => z.id)).toEqual(['A', 'B', 'C']);
    const mid = { x: (map.spawns.usa.x + map.spawns.russia.x) / 2, z: (map.spawns.usa.z + map.spawns.russia.z) / 2 };
    expect(zones[1].x).toBeCloseTo(mid.x, 6);
    expect(zones[1].z).toBeCloseTo(mid.z, 6);
    for (const z of zones) {
      // On the front: as far from one spawn as from the other.
      expect(Math.hypot(z.x - map.spawns.usa.x, z.z - map.spawns.usa.z)).toBeCloseTo(Math.hypot(z.x - map.spawns.russia.x, z.z - map.spawns.russia.z), 6);
      expect(Math.hypot(z.x - map.combatArea.x, z.z - map.combatArea.z) + z.radiusM).toBeLessThan(map.combatArea.radiusM);
      expect([z.radiusM, z.floorM, z.ceilingM]).toEqual([4000, 1000, 7000]);
    }
    expect(Math.hypot(zones[0].x - zones[2].x, zones[0].z - zones[2].z)).toBeCloseTo(2 * 0.4 * map.combatArea.radiusM, 6);
  });

  it('is a cylinder from 1 to 7 km', () => {
    const z = zone();
    expect(insideZone(z, 3900, 3000, 0)).toBe(true);
    expect(insideZone(z, 4100, 3000, 0)).toBe(false);
    expect(insideZone(z, 0, 900, 0)).toBe(false);
    expect(insideZone(z, 0, 7100, 0)).toBe(false);
  });

  it('captures a neutral zone in 10 s with one more aircraft, faster with more', () => {
    const z = zone();
    z.inside.usa = 1;
    for (let t = 0; t < (CAPTURE_S - 0.5) * 60; t++) stepZone(z, 1 / 60);
    expect(z.owner).toBeNull();
    for (let t = 0; t < 60; t++) stepZone(z, 1 / 60);
    expect(z.owner).toBe('usa');
    const fast = zone();
    fast.inside.russia = 3;
    fast.inside.usa = 1;
    for (let t = 0; t < 5 * 60 + 1; t++) stepZone(fast, 1 / 60);
    expect(fast.owner).toBe('russia');
  });

  it('holds still when tied or empty, and must be neutralized before the other side captures it', () => {
    const z = zone(1, 'usa');
    z.inside.usa = 2;
    z.inside.russia = 2;
    expect(stepZone(z, 1)).toBeNull();
    expect(z.progress).toBe(1);
    z.inside.usa = 0;
    z.inside.russia = 1;
    const changes = [];
    for (let t = 0; t < 21 * 60; t++) {
      const c = stepZone(z, 1 / 60);
      if (c) changes.push({ ...c, atS: t / 60 });
    }
    expect(changes.map((c) => [c.owner, c.previous])).toEqual([
      [null, 'usa'],
      ['russia', null],
    ]);
    expect(changes[0].atS).toBeCloseTo(10, 1);
    expect(changes[1].atS).toBeCloseTo(20, 1);
  });
});

describe('AirSuperiorityMode', () => {
  it('counts only living fighters inside a zone, emits captures and scores a point per owned zone every 2 s', () => {
    const mode = new AirSuperiorityMode();
    mode.prepare(map);
    const b = frontZones(map)[1];
    const inside = jet('usa', b.x, 3000, b.z);
    const low = jet('russia', b.x, 500, b.z);
    const dead = jet('russia', b.x, 3000, b.z);
    dead.alive = false;
    const events: GameEvent[] = [];
    const ctx = context([inside, low, dead], events);
    for (let t = 0; t <= 14 * 60; t++) {
      ctx.tick = t;
      mode.update(ctx);
    }
    const status = mode.status(ctx);
    expect(status.zones?.[1]).toMatchObject({ owner: 'usa', progress: 1, inside: { usa: 1, russia: 0 } });
    expect(events).toEqual([{ type: 'zone', zoneId: 'B', owner: 'usa', previous: null }]);
    // Captured at 10 s: points at 10 (the capture tick), 12 and 14 s.
    expect(status.scores).toEqual({ usa: 3, russia: 0 });
    expect(status.label).toBe('Air Superiority');
    expect(mode.combatEnabled).toBe(true);
  });

  it('ends at the score limit, or on time with the higher score', () => {
    const mode = new AirSuperiorityMode({ scoreLimit: 2 });
    mode.prepare(map);
    const a = frontZones(map)[0];
    const ctx = context([jet('russia', a.x, 2000, a.z)]);
    for (let t = 0; t <= 20 * 60 && mode.status(ctx).winner === null; t++) {
      ctx.tick = t;
      mode.update(ctx);
    }
    expect(mode.status(ctx)).toMatchObject({ winner: 'russia', scores: { usa: 0, russia: 2 } });

    const timed = new AirSuperiorityMode({ timeLimitS: 5 });
    timed.prepare(map);
    const empty = context([]);
    empty.tick = 0;
    timed.update(empty);
    empty.tick = 5 * 60;
    timed.update(empty);
    expect(timed.status(empty)).toMatchObject({ winner: 'draw', timeLeftS: 0 });
  });

  it('sends bots to zones their side does not own, spread by id', () => {
    const mode = new AirSuperiorityMode();
    mode.prepare(map);
    const ctx = context([]);
    const goals = [0, 1, 2].map((i) => {
      const bot = jet('usa', 0, 3000, 0);
      Object.assign(bot, { id: 30 + i });
      return mode.botGoal(ctx, bot);
    });
    const zones = frontZones(map);
    const ids = goals.map((g) => zones.findIndex((z) => z.x === g?.x && z.z === g?.z));
    expect(new Set(ids).size).toBe(3);
    for (const g of goals) {
      expect(g?.altitudeM).toBeGreaterThan(1000);
      expect(g?.altitudeM).toBeLessThan(7000);
      expect(g?.radiusM).toBeLessThan(4000);
    }
  });
});
