import { beforeAll, describe, expect, it } from 'vitest';
import { buildTerrain, type MapDefinition } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import type { GridTerrain } from '../map/terrain.ts';
import type { ControlInput } from '../physics/controls.ts';
import type { AircraftEntity } from '../world/entities.ts';
import { World } from '../world/world.ts';
import { RING_PASS_RADIUS_M, TrainingMode } from './training.ts';

let map: MapDefinition;
let terrain: GridTerrain;
beforeAll(() => {
  map = createTestRange(1);
  terrain = buildTerrain(map);
});

function setup() {
  const mode = new TrainingMode();
  const world = new World({ map, terrain, mode, seed: 9 });
  const player = world.addAircraft({ callsign: 'Pilot', team: 'usa', aircraftId: 'kestrel' });
  const inputs = new Map<number, ControlInput>();
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) world.step(inputs);
  };
  const status = () => {
    const t = mode.status(world).training;
    if (!t) throw new Error('no training status');
    return t;
  };
  const drone = (): AircraftEntity => {
    const id = status().droneId;
    const d = id === null ? undefined : world.getAircraft(id);
    if (!d) throw new Error('no drone');
    return d;
  };
  return { mode, world, player, step, status, drone };
}

/** Puts the player at the next ring, flying on toward it. */
function flyThroughRing(t: ReturnType<typeof setup>) {
  const ring = t.status().ring;
  if (!ring) throw new Error('no ring');
  t.player.flight.pos.set(ring.x - 50, ring.y, ring.z);
  t.step();
}

describe('TrainingMode', () => {
  it('starts with three rings ahead of the player', () => {
    const t = setup();
    t.step();
    const s = t.status();
    expect(s.step).toBe('fly');
    expect(s.index).toBe(1);
    expect(s.ringsTotal).toBe(3);
    expect(s.ring).not.toBeNull();
    // The player spawns heading east: the first ring is ahead, within a few kilometres.
    const ring = s.ring ?? { x: 0, y: 0, z: 0 };
    const dx = ring.x - t.player.flight.pos.x;
    expect(dx).toBeGreaterThan(2000);
    expect(dx).toBeLessThan(5000);
    expect(t.mode.status(t.world).winner).toBeNull();
  });

  it('counts a ring only when the jet passes close to it', () => {
    const t = setup();
    t.step();
    const ring = t.status().ring ?? { x: 0, y: 0, z: 0 };
    t.player.flight.pos.set(ring.x, ring.y + RING_PASS_RADIUS_M + 100, ring.z);
    t.step();
    expect(t.status().ringsPassed).toBe(0);
    flyThroughRing(t);
    expect(t.status().ringsPassed).toBe(1);
  });

  it('moves from the rings to a gun target drone ahead of the player', () => {
    const t = setup();
    t.step();
    for (let i = 0; i < 3; i++) flyThroughRing(t);
    t.step();
    const s = t.status();
    expect(s.step).toBe('gun');
    const d = t.drone();
    expect(d.team).toBe('russia');
    expect(d.isBot).toBe(true);
    const range = d.flight.pos.distanceTo(t.player.flight.pos);
    expect(range).toBeGreaterThan(1000);
    expect(range).toBeLessThan(2500);
  });

  it('runs gun, missile and defend lessons, then finishes with the player as the winner', () => {
    const t = setup();
    t.step();
    for (let i = 0; i < 3; i++) flyThroughRing(t);
    t.step();
    t.world.applyDamage(t.drone(), 9999, t.player, 'cannon');
    t.step(2);
    expect(t.status().step).toBe('missile');
    const missileDrone = t.drone();
    expect(missileDrone.flight.pos.distanceTo(t.player.flight.pos)).toBeGreaterThan(3000);
    t.world.applyDamage(missileDrone, 9999, t.player, 'missile');
    t.step(2);
    expect(t.status().step).toBe('defend');
    // A scripted missile comes at the player within a couple of seconds.
    t.step(150);
    const inbound = t.world.missileList().filter((m) => m.targetId === t.player.id);
    expect(inbound.length).toBe(1);
    // The player beats it (here: the missile is simply gone) and survives.
    t.world.combat.missiles.length = 0;
    t.step(120);
    const done = t.status();
    expect(done.step).toBe('done');
    expect(done.index).toBe(done.total);
    expect(t.mode.status(t.world).winner).toBe('usa');
    expect(t.status().droneId).toBeNull();
  });

  it('restarts a lesson with a fresh drone after the player is shot down', () => {
    const t = setup();
    t.step();
    for (let i = 0; i < 3; i++) flyThroughRing(t);
    t.step();
    const first = t.drone().id;
    t.world.applyDamage(t.player, 9999, null, 'cannon');
    t.step(60 * 5);
    expect(t.player.alive).toBe(true);
    const s = t.status();
    expect(s.step).toBe('gun');
    expect(s.attempt).toBe(2);
    expect(t.drone().id).not.toBe(first);
    expect(t.world.getAircraft(first)).toBeUndefined();
  });

  it('refills the player at the start of every lesson', () => {
    const t = setup();
    t.step();
    t.player.stores.cannonRounds = 0;
    t.player.stores.countermeasures = 0;
    for (let i = 0; i < 3; i++) flyThroughRing(t);
    t.step();
    expect(t.player.stores.cannonRounds).toBe(t.player.config.stores.cannonRounds);
    expect(t.player.stores.countermeasures).toBe(t.player.config.stores.countermeasures);
  });
});
