import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { DEG } from '../math/units.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import { headingRad } from '../physics/flight-model.ts';
import type { AircraftEntity } from '../world/entities.ts';
import { TICK_RATE, World } from '../world/world.ts';
import { createMode } from './registry.ts';
import {
  DATALINK_DOWN_S,
  SENTINEL_ALTITUDE_M,
  SENTINEL_RETURN_S,
  sentinelHitPoints,
  sentinelOrbits,
  TEAM_OBJECTIVE_LANCES,
  TeamObjectiveMode,
} from './team-objective.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const newWorld = (mode = new TeamObjectiveMode()) => new World({ map, terrain, mode, seed: 3 });
const run = (w: World, ticks: number, inputs: ReadonlyMap<number, ControlInput> = new Map()) => {
  for (let i = 0; i < ticks; i++) w.step(inputs);
};
const sentinels = (w: World) => [...w.aircraftList()].filter((a) => a.support);

describe('Team Objective layout (spec §13)', () => {
  it('orbits two Sentinels per team behind its own spawn, inside the combat area', () => {
    for (const team of ['usa', 'russia'] as const) {
      const own = map.spawns[team];
      const other = map.spawns[team === 'usa' ? 'russia' : 'usa'];
      const orbits = sentinelOrbits(map, team);
      expect(orbits).toHaveLength(2);
      for (const o of orbits) {
        expect(Math.hypot(o.x - other.x, o.z - other.z)).toBeGreaterThan(Math.hypot(own.x - other.x, own.z - other.z));
        expect(Math.hypot(o.x - map.combatArea.x, o.z - map.combatArea.z) + o.radiusM).toBeLessThan(0.9 * map.combatArea.radiusM);
        expect(o.altitudeM).toBe(SENTINEL_ALTITUDE_M);
      }
      expect(Math.hypot(orbits[0].x - orbits[1].x, orbits[0].z - orbits[1].z)).toBeGreaterThan(2 * orbits[0].radiusM);
    }
  });
});

describe('Sentinels in the World', () => {
  it('starts four Sentinels that hold their orbits at about 150 m/s', () => {
    const w = newWorld();
    const list = sentinels(w);
    expect(list.map((s) => s.team).sort()).toEqual(['russia', 'russia', 'usa', 'usa']);
    // Three fighters a side by default: the USA's Sentinels are sturdier (revision 19).
    expect(list.every((s) => s.isBot && s.config.support && s.hp === (s.team === 'usa' ? 550 : 400))).toBe(true);
    run(w, 120 * TICK_RATE);
    for (const s of list) {
      const o = s.support!.orbit;
      expect(s.alive).toBe(true);
      expect(Math.abs(s.flight.pos.y - o.altitudeM)).toBeLessThan(300);
      expect(Math.abs(Math.hypot(s.flight.pos.x - o.x, s.flight.pos.z - o.z) - o.radiusM)).toBeLessThan(1500);
      expect(Math.abs(s.flight.airspeed - o.speedMs)).toBeLessThan(25);
    }
  });

  it('runs from an enemy fighter that comes close', () => {
    const w = newWorld();
    const target = sentinels(w).find((s) => s.team === 'russia')!;
    const hunter = w.addAircraft({ callsign: 'H', team: 'usa', aircraftId: 'kestrel' });
    // Park the hunter 8 km west of the Sentinel at its height, flying straight on.
    hunter.flight.pos.set(target.flight.pos.x - 8000, target.flight.pos.y, target.flight.pos.z);
    hunter.flight.vel.set(0, 0, -200);
    run(w, 25 * TICK_RATE, new Map([[hunter.id, neutralInput(0.8)]]));
    const away = new Vector3().subVectors(target.flight.pos, hunter.flight.pos).setY(0).normalize();
    const going = target.flight.vel.clone().setY(0).normalize();
    expect(going.dot(away)).toBeGreaterThan(0.6);
    expect(target.flight.throttle).toBeGreaterThan(0.85);
  });

  it('scores 20 for a Sentinel, cuts its team datalink for 60 s and brings it back after 120 s', () => {
    const mode = new TeamObjectiveMode();
    const w = newWorld(mode);
    const usa = w.addAircraft({ callsign: 'U', team: 'usa', aircraftId: 'condor' });
    const target = sentinels(w).find((s) => s.team === 'russia')!;
    run(w, 1);
    w.applyDamage(target, 400, usa, 'missile');
    expect(target.alive).toBe(false);
    expect(usa.kills).toBe(1);
    let s = mode.status(w);
    expect(s.scores).toEqual({ usa: 20, russia: 0 });
    expect(s.objective?.sentinelsDestroyed).toEqual({ usa: 1, russia: 0 });
    run(w, 1);
    expect(w.datalinkUp('russia')).toBe(false);
    expect(w.datalinkUp('usa')).toBe(true);
    s = mode.status(w);
    expect(s.objective?.datalinkDownS.russia).toBeGreaterThan(DATALINK_DOWN_S - 1);
    expect(s.objective?.sentinels.find((x) => x.id === target.id)).toMatchObject({ alive: false, returnInS: SENTINEL_RETURN_S });
    run(w, DATALINK_DOWN_S * TICK_RATE);
    expect(w.datalinkUp('russia')).toBe(true);
    run(w, (SENTINEL_RETURN_S - DATALINK_DOWN_S) * TICK_RATE);
    expect(target.alive).toBe(true);
    expect(target.hp).toBe(400);
    expect(target.flight.pos.y).toBeCloseTo(SENTINEL_ALTITUDE_M, -2);
  });

  it('gives a point for every fighter death and ends at 60', () => {
    const mode = new TeamObjectiveMode({ scoreLimit: 22 });
    const w = newWorld(mode);
    const usa = w.addAircraft({ callsign: 'U', team: 'usa', aircraftId: 'condor' });
    const rus = w.addAircraft({ callsign: 'R', team: 'russia', aircraftId: 'kobchik' });
    run(w, 1);
    w.applyDamage(rus, 500, usa, 'cannon');
    expect(mode.status(w).scores).toEqual({ usa: 1, russia: 0 });
    w.applyDamage(sentinels(w).find((x) => x.team === 'russia')!, 400, usa, 'cannon');
    expect(mode.status(w).winner).toBeNull();
    run(w, 6 * TICK_RATE);
    w.applyDamage(rus, 500, usa, 'cannon');
    expect(mode.status(w)).toMatchObject({ scores: { usa: 22, russia: 0 }, winner: 'usa' });
  });

  it('sends most bots after the enemy Sentinels and every third fighter of a team to guard its own', () => {
    const guards = (perSide: number) => {
      const mode = new TeamObjectiveMode();
      const w = newWorld(mode);
      const fighters: AircraftEntity[] = [];
      for (const team of ['usa', 'russia'] as const)
        for (let i = 0; i < perSide; i++) fighters.push(w.addAircraft({ callsign: `${team}${i}`, team, aircraftId: team === 'usa' ? 'condor' : 'sapsan' }));
      const near = (g: ReturnType<TeamObjectiveMode['botGoal']>, team: 'usa' | 'russia') =>
        sentinels(w).some((s) => s.team === team && g !== null && Math.hypot(s.flight.pos.x - g.x, s.flight.pos.z - g.z) < 1);
      const count = (team: 'usa' | 'russia') => fighters.filter((f) => f.team === team && near(mode.botGoal(w, f), team)).length;
      const hunters = (team: 'usa' | 'russia') => fighters.filter((f) => f.team === team && near(mode.botGoal(w, f), team === 'usa' ? 'russia' : 'usa')).length;
      return { usa: count('usa'), russia: count('russia'), hunters: hunters('usa') + hunters('russia') };
    };
    // A lone fighter hunts; both sides always guard with as many fighters (counting ids gave them different numbers).
    expect(guards(1)).toEqual({ usa: 0, russia: 0, hunters: 2 });
    expect(guards(2)).toEqual({ usa: 0, russia: 0, hunters: 4 });
    expect(guards(3)).toEqual({ usa: 1, russia: 1, hunters: 4 });
    expect(guards(4)).toEqual({ usa: 1, russia: 1, hunters: 6 });
  });

  it('makes the USA Sentinels sturdier the more Russian fighters there are', () => {
    expect([1, 2, 3, 4].map((n) => sentinelHitPoints('usa', n))).toEqual([450, 500, 550, 600]);
    expect(sentinelHitPoints('russia', 4)).toBe(400);
    const w = new World({ map, terrain, mode: createMode('team-objective', { teamObjective: { fighters: { usa: 1, russia: 4 } } }), seed: 3 });
    for (const s of sentinels(w)) {
      expect(s.hp).toBe(s.team === 'usa' ? 600 : 400);
      expect(s.config.damage.hitPoints).toBe(s.hp);
    }
  });

  it('arms every fighter with the same Lances, whatever its own load', () => {
    const w = newWorld();
    const sapsan = w.addAircraft({ callsign: 'S', team: 'russia', aircraftId: 'sapsan' });
    const kestrel = w.addAircraft({ callsign: 'K', team: 'usa', aircraftId: 'kestrel' });
    expect([sapsan.stores.mrm, kestrel.stores.mrm]).toEqual([TEAM_OBJECTIVE_LANCES, TEAM_OBJECTIVE_LANCES]);
    expect(sapsan.config.stores.mrm).toBe(6);
    // Other modes keep each jet's own load.
    const tdm = new World({ map, terrain, mode: createMode('team-deathmatch'), seed: 3 });
    expect(tdm.addAircraft({ callsign: 'S', team: 'russia', aircraftId: 'sapsan' }).stores.mrm).toBe(6);
  });

  it('starts every Sentinel on the far side of its orbit from the middle, so both teams start alike', () => {
    const w = newWorld();
    const c = map.combatArea;
    for (const s of sentinels(w)) {
      const o = s.support!.orbit;
      expect(Math.hypot(s.flight.pos.x - c.x, s.flight.pos.z - c.z)).toBeCloseTo(Math.hypot(o.x - c.x, o.z - c.z) + o.radiusM, 0);
    }
    const [u, r] = ['usa', 'russia'].map((t) => sentinels(w).filter((s) => s.team === t).map((s) => Math.hypot(s.flight.pos.x - c.x, s.flight.pos.z - c.z)));
    expect(Math.min(...u)).toBeCloseTo(Math.min(...r), 0);
  });

  it('runs from a fighter in a level, bank-limited turn instead of spiralling into the ground', () => {
    const w = newWorld();
    const target = sentinels(w).find((s) => s.team === 'russia')!;
    const hunter = w.addAircraft({ callsign: 'H', team: 'usa', aircraftId: 'kestrel' });
    let lowest = Infinity;
    let steepest = 0;
    const up = new Vector3();
    for (let t = 0; t < 90 * TICK_RATE; t++) {
      // A fighter sitting 6 km off its nose keeps it running the whole time.
      const f = target.flight;
      const ahead = new Vector3(0, 0, -1).applyQuaternion(f.quat).setY(0).normalize();
      hunter.flight.pos.set(f.pos.x + ahead.x * 6000, f.pos.y, f.pos.z + ahead.z * 6000);
      hunter.flight.vel.set(0, 0, 0);
      w.step(new Map([[hunter.id, neutralInput(0.8)]]));
      lowest = Math.min(lowest, f.pos.y);
      up.set(0, 1, 0).applyQuaternion(f.quat);
      steepest = Math.max(steepest, Math.acos(Math.min(1, up.y)));
    }
    expect(target.alive).toBe(true);
    expect(lowest).toBeGreaterThan(SENTINEL_ALTITUDE_M - 800);
    expect(steepest).toBeLessThan(55 * DEG);
  });
});

describe('datalink (spec §10.3, M5)', () => {
  it("shows each pilot the enemies on a teammate's radar, unless the link is down; it is never lockable", () => {
    const mode = new TeamObjectiveMode();
    const w = newWorld(mode);
    for (const s of sentinels(w)) w.removeAircraft(s.id);
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'condor' });
    const b = w.addAircraft({ callsign: 'B', team: 'usa', aircraftId: 'kestrel' });
    const e = w.addAircraft({ callsign: 'E', team: 'russia', aircraftId: 'sapsan' });
    // A looks east at E 30 km away; B looks west, away from both.
    a.flight.pos.set(-15000, 5000, 0);
    e.flight.pos.set(15000, 5000, 0);
    b.flight.pos.set(-15000, 5000, 15000);
    a.flight.quat.setFromAxisAngle(new Vector3(0, 1, 0), -90 * DEG);
    b.flight.quat.setFromAxisAngle(new Vector3(0, 1, 0), 90 * DEG);
    e.flight.quat.setFromAxisAngle(new Vector3(0, 1, 0), 90 * DEG);
    expect(headingRad(a.flight)).toBeCloseTo(90 * DEG, 3);
    run(w, 13);
    expect(a.contacts.map((c) => c.id)).toContain(e.id);
    expect(b.contacts).toHaveLength(0);
    expect(b.datalink).toEqual([e.id]);
    expect(a.datalink).toEqual([]);
    expect(b.targetId).toBeNull();
    b.input.cycleTarget = true;
    run(w, 1, new Map([[b.id, { ...neutralInput(0.8), cycleTarget: true }]]));
    expect(b.targetId).toBeNull();
    // A Sentinel of their own lost: the link goes down.
    mode.onAircraftDestroyed(w, { team: 'usa', support: {} } as AircraftEntity);
    run(w, 13);
    expect(b.datalink).toEqual([]);
  });
});

describe('jet change on respawn (M5)', () => {
  it('flies the chosen jet of the same team after the next respawn', () => {
    const w = newWorld();
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    expect(w.setNextAircraft(a.id, 'kobchik')).toBe(false);
    expect(w.setNextAircraft(a.id, 'sentinel-usa')).toBe(false);
    expect(w.setNextAircraft(a.id, 'nope')).toBe(false);
    expect(w.setNextAircraft(a.id, 'condor')).toBe(true);
    expect(a.config.id).toBe('kestrel');
    w.applyDamage(a, 999, null, 'cannon');
    run(w, 6 * TICK_RATE);
    expect(a.alive).toBe(true);
    expect(a.config.id).toBe('condor');
    expect(a.stores.cannonRounds).toBe(940);
    expect(a.nextAircraftId).toBeNull();
  });
});
