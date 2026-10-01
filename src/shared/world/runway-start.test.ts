import { describe, expect, it } from 'vitest';
import { createLechovia } from '../data/maps/lechovia/index.ts';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { airfieldLocal } from '../map/features.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import { teamAirfield } from './spawns.ts';
import { TICK_RATE, World } from './world.ts';

const map = createLechovia();
const terrain = buildTerrain(map);

function fly(w: World, id: number, seconds: number, input: Partial<ControlInput> | ((w: World) => Partial<ControlInput>)): void {
  const inputs = new Map([[id, neutralInput(0.9)]]);
  for (let t = 0; t < seconds * TICK_RATE; t++) {
    Object.assign(inputs.get(id)!, neutralInput(0.9), typeof input === 'function' ? input(w) : input);
    w.step(inputs);
  }
}

describe('runway starts (spec §13, M4)', () => {
  it('starts a pilot who asks for it on the team runway, and others in the air', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 3 });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel', start: 'runway' });
    const b = w.addAircraft({ callsign: 'B', team: 'russia', aircraftId: 'kobchik' });
    const usaField = teamAirfield(map, 'usa')!;
    const { u, v } = airfieldLocal(usaField, a.flight.pos.x, a.flight.pos.z);
    expect(Math.abs(u)).toBeLessThan(usaField.lengthM / 2);
    expect(Math.abs(v)).toBeLessThan(usaField.widthM / 2);
    expect(a.flight.onGround).toBe(true);
    expect(b.flight.onGround).toBe(false);
    expect(b.flight.pos.y).toBeGreaterThan(4000);
  });

  it('takes off without crashing, and starts on the runway again after a death', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 3 });
    const a = w.addAircraft({ callsign: 'A', team: 'russia', aircraftId: 'yastreb', start: 'runway' });
    fly(w, a.id, 5, { throttle: 0.9 });
    expect(a.alive).toBe(true);
    expect(a.flight.onGround).toBe(true);
    expect(a.flight.vel.length()).toBeGreaterThan(20);
    // Pull until 300 m above the runway, then fly on level.
    const top = teamAirfield(map, 'russia')!.elevationM + 300;
    fly(w, a.id, 30, () => ({ throttle: 1, pitch: a.flight.pos.y < top ? 0.5 : 0 }));
    expect(a.alive).toBe(true);
    expect(a.flight.onGround).toBe(false);
    expect(a.flight.gear).toBe(0);
    // Dive into the ground: the next jet starts on the runway again.
    fly(w, a.id, 60, { throttle: 1, pitch: -1 });
    expect(a.deaths).toBeGreaterThanOrEqual(1);
    fly(w, a.id, 6, { throttle: 0 });
    expect(a.alive).toBe(true);
    expect(a.flight.onGround).toBe(true);
  });

  it('crashes a jet that rolls off the airfield', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 3 });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'condor', start: 'runway' });
    fly(w, a.id, 4, { throttle: 0.9 });
    fly(w, a.id, 30, { throttle: 0.9, roll: -1 });
    const events = w.drainEvents().filter((e) => e.type === 'destroyed');
    expect(events.map((e) => e.type === 'destroyed' && e.cause)).toContain('crash');
  });

  it('ignores runway starts in modes without them', () => {
    class AirOnly extends TeamDeathmatchMode {
      readonly runwayStarts = false;
    }
    const w = new World({ map, terrain, mode: new AirOnly(), seed: 3 });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel', start: 'runway' });
    expect(a.flight.onGround).toBe(false);
  });
});
