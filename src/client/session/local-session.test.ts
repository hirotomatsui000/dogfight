import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../../shared/data/maps/map-definition.ts';
import { createTestRange } from '../../shared/data/maps/test-range.ts';
import { FreeFlightMode } from '../../shared/modes/free-flight.ts';
import { neutralInput } from '../../shared/physics/controls.ts';
import { LocalSession } from './local-session.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const newSession = () =>
  new LocalSession({ map, terrain, mode: new FreeFlightMode(), aircraftId: 'kestrel', callsign: 'Pilot' });

describe('LocalSession', () => {
  it('spawns the local player and exposes a view', () => {
    const s = newSession();
    s.update(1 / 60, neutralInput(0.8));
    const me = s.localView();
    expect(me).not.toBeNull();
    expect(me?.isLocal).toBe(true);
    expect(me?.callsign).toBe('Pilot');
    expect(s.drainEvents()).toContainEqual({ type: 'spawned', aircraftId: s.localId, spawnGen: 1 });
  });
  it('advances the world in fixed steps', () => {
    const s = newSession();
    s.update(1 / 60, neutralInput(0.8));
    expect(s.world.tick).toBe(1);
    s.update(0.5, neutralInput(0.8));
    expect(s.world.tick).toBe(6);
  });
  it('interpolates the rendered position between simulation steps', () => {
    const s = newSession();
    s.update(1 / 60, neutralInput(0.8));
    s.update(1 / 60, neutralInput(0.8));
    const sim = s.world.getAircraft(s.localId);
    s.update(1 / 120, neutralInput(0.8));
    const view = s.localView();
    expect(sim && view).toBeTruthy();
    if (!sim || !view) return;
    const behind = view.position.distanceTo(sim.flight.pos);
    expect(behind).toBeGreaterThan(1);
    expect(behind).toBeLessThan(sim.flight.vel.length() / 60);
  });
  it('reports the mode status', () => {
    expect(newSession().modeStatus().label).toBe('Free Flight');
  });
});
