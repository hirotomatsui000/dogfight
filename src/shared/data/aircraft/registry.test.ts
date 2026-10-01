import { describe, expect, it } from 'vitest';
import { Rng } from '../../math/rng.ts';
import { getAircraft, listAircraft, opposingTeam, randomAircraft, sentinelFor } from './registry.ts';
import { validateAircraftConfig } from './validate.ts';

describe('aircraft registry', () => {
  it('returns Kestrel and Kobchik by id', () => {
    expect(getAircraft('kestrel').name).toBe('Kestrel');
    expect(getAircraft('kobchik').name).toBe('Kobchik');
  });
  it('throws for unknown ids', () => {
    expect(() => getAircraft('nope')).toThrow('Unknown aircraft: nope');
  });
  it('lists by team, with at least one aircraft per team', () => {
    expect(listAircraft('usa').map((a) => a.id)).toContain('kestrel');
    expect(listAircraft('russia').map((a) => a.id)).toContain('kobchik');
    expect(listAircraft('russia').every((a) => a.team === 'russia')).toBe(true);
  });
  it('contains only valid configs with unique ids', () => {
    const all = listAircraft();
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
    for (const a of all) expect(validateAircraftConfig(a)).toEqual([]);
  });
  it('has the eight jets of the roster, four per team, in the spec order', () => {
    expect(listAircraft('usa').map((a) => a.id)).toEqual(['shade', 'tempest', 'kestrel', 'condor']);
    expect(listAircraft('russia').map((a) => a.id)).toEqual(['prizrak', 'yastreb', 'sapsan', 'kobchik']);
  });

  it('matches the roster table in the spec (§9.3, with the M3 balance changes of revision 10)', () => {
    // id: mass, wing area, thrust mil/AB kN, roll, HP, radar km/cone, stealth, SRM/MRM, cannon/rounds, salvos, TV
    const table: Record<string, [number, number, number, number, number, number, number, number, number, number, number, string, number, number, number]> = {
      shade: [21000, 43, 120, 195, 130, 100, 60, 60, 0.85, 2, 4, 'RC-25', 180, 32, 0],
      tempest: [27000, 78, 225, 315, 155, 85, 50, 60, 0.8, 2, 4, 'RC-20', 480, 24, 0.5],
      kestrel: [12000, 28, 76, 130, 180, 80, 35, 60, 0.15, 4, 2, 'RC-20', 510, 40, 0],
      condor: [20500, 56, 128, 212, 135, 105, 55, 60, 0, 4, 4, 'RC-20', 940, 60, 0],
      prizrak: [26000, 78, 185, 300, 160, 110, 50, 75, 0.6, 2, 4, 'HC-30', 150, 30, 1],
      yastreb: [25000, 62, 170, 285, 140, 100, 55, 60, 0.05, 4, 6, 'HC-30', 150, 60, 1],
      sapsan: [26500, 62, 150, 250, 120, 100, 60, 60, 0, 4, 6, 'HC-30', 150, 60, 0],
      kobchik: [15000, 38, 100, 165, 160, 90, 30, 60, 0.15, 4, 2, 'HC-30', 150, 40, 0],
    };
    for (const [id, row] of Object.entries(table)) {
      const c = getAircraft(id);
      const p = c.physics;
      const s = c.sensors;
      const st = c.stores;
      expect([p.massKg, p.wingAreaM2, p.thrustMilN / 1000, p.thrustAbN / 1000, p.maxRollRateDegS, c.damage.hitPoints, s.radarRangeKm, s.radarConeDeg, s.stealth, st.srm, st.mrm, st.cannon, st.cannonRounds, st.countermeasures, p.thrustVectoring], id).toEqual(row);
    }
    expect(getAircraft('shade').sensors.sensorFusion).toBe(true);
    expect(getAircraft('sapsan').sensors.twoSeat).toBe(true);
    expect(getAircraft('kobchik').sensors.helmetSight).toBe(true);
  });

  it('knows the Sentinels (M5) by id but never offers them to pilots or bots', () => {
    for (const team of ['usa', 'russia'] as const) {
      const s = sentinelFor(team);
      expect(s.team).toBe(team);
      expect(s.support).toBe(true);
      expect(getAircraft(s.id)).toBe(s);
      expect(validateAircraftConfig(s)).toEqual([]);
      expect(listAircraft().some((a) => a.support)).toBe(false);
    }
    expect(sentinelFor('usa').damage.hitPoints).toBe(400);
  });

  it('picks random jets of one team from a seeded generator', () => {
    const rng = new Rng(5);
    const picks = Array.from({ length: 200 }, () => randomAircraft('russia', rng).id);
    expect(new Set(picks)).toEqual(new Set(['prizrak', 'yastreb', 'sapsan', 'kobchik']));
    const again = new Rng(5);
    expect(Array.from({ length: 200 }, () => randomAircraft('russia', again).id)).toEqual(picks);
  });

  it('names the opposing team', () => {
    expect(opposingTeam('usa')).toBe('russia');
    expect(opposingTeam('russia')).toBe('usa');
  });
});
