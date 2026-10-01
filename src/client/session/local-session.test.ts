import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../shared/ai/difficulty.ts';
import { buildTerrain } from '../../shared/data/maps/map-definition.ts';
import { createTestRange } from '../../shared/data/maps/test-range.ts';
import { FreeFlightMode } from '../../shared/modes/free-flight.ts';
import { StrikeMode } from '../../shared/modes/strike.ts';
import { TeamDeathmatchMode } from '../../shared/modes/team-deathmatch.ts';
import { neutralInput } from '../../shared/physics/controls.ts';
import { LocalSession } from './local-session.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const newSession = () =>
  new LocalSession({ map, terrain, mode: new FreeFlightMode(), aircraftId: 'kestrel', callsign: 'Pilot' });
const dogfight = (aircraftId = 'kestrel') =>
  new LocalSession({ map, terrain, mode: new TeamDeathmatchMode(), aircraftId, callsign: 'Pilot', opponents: { count: 1, profile: DIFFICULTIES.rookie } });

describe('LocalSession', () => {
  it('spawns the local player and exposes a view', () => {
    const s = newSession();
    s.update(1 / 60, neutralInput(0.8));
    const me = s.localView();
    expect(me).not.toBeNull();
    expect(me?.isLocal).toBe(true);
    expect(me?.callsign).toBe('Pilot');
    expect(me?.stores.srm).toBe(me?.config.stores.srm);
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

  it('adds AI opponents flying for the other team', () => {
    const s = dogfight('kobchik');
    s.update(1 / 60, neutralInput(0.8));
    const bots = [...s.views()].filter((v) => v.isBot);
    expect(bots).toHaveLength(1);
    expect(bots[0].team).toBe('usa');
    expect(bots[0].config.id).toBe('kestrel');
    expect(bots[0].callsign).toBe('[BOT] Ranger');
    expect(s.view(bots[0].id)).toBe(bots[0]);
  });

  it('keeps a button press for the next simulation step, and uses it once', () => {
    const s = dogfight();
    s.update(1 / 240, { ...neutralInput(0.8), countermeasures: true });
    expect(s.world.tick).toBe(0);
    s.update(1 / 60, neutralInput(0.8));
    s.update(1 / 30, neutralInput(0.8));
    const me = s.localView();
    expect(me?.stores.countermeasures).toBe((me?.config.stores.countermeasures ?? 0) - 1);
  });

  it('shows projectiles and missiles in flight', () => {
    const s = dogfight();
    for (let i = 0; i < 10; i++) s.update(1 / 60, { ...neutralInput(0.8), fireCannon: true });
    const shots = [...s.projectiles()];
    expect(shots.length).toBeGreaterThan(3);
    expect(shots[0].velocity.length()).toBeGreaterThan(900);
    expect([...s.missiles()]).toEqual([]);
  });
});

const strike = (aircraftId = 'kobchik') =>
  new LocalSession({ map, terrain, mode: new StrikeMode(), aircraftId, callsign: 'Pilot', opponents: { count: 1, profile: DIFFICULTIES.rookie } });

describe('LocalSession in Strike', () => {
  it('shows the targets and the attacker bomb load', () => {
    const s = strike();
    s.update(1 / 60, neutralInput(0.8));
    expect(s.groundTargets().map((t) => [t.id, t.hp, t.destroyed])).toEqual([
      ['A', 100, false],
      ['B', 100, false],
      ['C', 100, false],
    ]);
    expect([s.localView()?.bombLoad, s.localView()?.stores.bombs]).toEqual([8, 8]);
    expect([...s.views()].find((v) => v.isBot)?.bombLoad).toBe(0);
  });

  it('drops one bomb for a G press that arrives between simulation steps', () => {
    const s = strike();
    s.update(1 / 240, { ...neutralInput(0.8), dropBomb: true });
    s.update(1 / 60, neutralInput(0.8));
    s.update(1 / 60, neutralInput(0.8));
    expect([...s.bombs()]).toHaveLength(1);
    expect(s.localView()?.stores.bombs).toBe(7);
  });

  it('has no targets or bombs outside Strike', () => {
    const s = dogfight();
    s.update(1 / 60, neutralInput(0.8));
    expect([s.groundTargets().length, [...s.bombs()].length, s.localView()?.bombLoad]).toEqual([0, 0, 0]);
  });
});
