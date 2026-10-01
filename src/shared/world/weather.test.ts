import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { getAircraft } from '../data/aircraft/registry.ts';
import { SRM_DART } from '../data/weapons.ts';
import { GridTerrain } from '../map/terrain.ts';
import { DEG } from '../math/units.ts';
import { neutralInput } from '../physics/controls.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { createSeeker, updateSeeker } from '../targeting/ir-seeker.ts';
import { type Contact, detectContacts, type SensedAircraft } from '../targeting/sensors.ts';
import { CALM_NOON, daylight, hourAt, moonDirection, START_HOURS, sunDirection } from './time-of-day.ts';
import { CloudField, WEATHER, WEATHER_IDS } from './weather.ts';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

describe('weather (spec §12.3)', () => {
  it('has five presets, from clear to rain, with lower and darker clouds as they thicken', () => {
    expect(WEATHER_IDS).toEqual(['clear', 'scattered', 'broken', 'overcast', 'rain']);
    const cover = WEATHER_IDS.map((id) => WEATHER[id].coverage);
    expect(cover).toEqual([...cover].sort((a, b) => a - b));
    expect(WEATHER.rain.rain).toBe(true);
    expect(WEATHER.rain.cloudBaseM).toBeLessThan(WEATHER.scattered.cloudBaseM);
    expect(WEATHER.overcast.lightFactor).toBeLessThan(WEATHER.clear.lightFactor);
    for (const id of WEATHER_IDS) expect(WEATHER[id].cloudTopM).toBeGreaterThan(WEATHER[id].cloudBaseM);
  });

  it('covers about the preset share of the sky, the same way for the same seed', () => {
    for (const id of ['scattered', 'broken'] as const) {
      const clouds = new CloudField(WEATHER[id], 1);
      let covered = 0;
      let n = 0;
      for (let x = -90000; x <= 90000; x += 1500) {
        for (let z = -90000; z <= 90000; z += 1500) {
          if (clouds.coverAt(x, z) > 0.5) covered++;
          n++;
        }
      }
      expect(covered / n, id).toBeGreaterThan(WEATHER[id].coverage - 0.08);
      expect(covered / n, id).toBeLessThan(WEATHER[id].coverage + 0.08);
      expect(new CloudField(WEATHER[id], 1).coverAt(1234, 5678)).toBe(clouds.coverAt(1234, 5678));
    }
    expect(new CloudField(WEATHER.clear, 1).coverAt(0, 0)).toBe(0);
    expect(new CloudField(WEATHER.overcast, 1).coverAt(0, 0)).toBe(1);
  });

  it('blocks sight lines through the cloud layer only', () => {
    const deck = new CloudField(WEATHER.overcast, 1);
    expect(deck.blocks(v(0, 500, 0), v(4000, 500, 0))).toBe(false);
    expect(deck.blocks(v(0, 5000, 0), v(4000, 5000, 0))).toBe(false);
    expect(deck.blocks(v(0, 500, 0), v(2000, 5000, 0))).toBe(true);
    expect(deck.blocks(v(0, 1500, 0), v(3000, 1500, 0))).toBe(true);
    expect(new CloudField(WEATHER.clear, 1).blocks(v(0, 500, 0), v(2000, 5000, 0))).toBe(false);
    expect(deck.densityAt(0, 1500, 0)).toBe(1);
    expect(deck.densityAt(0, 900, 0)).toBe(0);
  });
});

describe('clouds and sensors (spec §12.3)', () => {
  const flat = GridTerrain.fromFunction(9, 40000, () => 0);
  const jet = (id: number, team: 'usa' | 'russia', pos: Vector3, headingRad: number): SensedAircraft & { input: ReturnType<typeof neutralInput> } => ({
    id,
    team,
    alive: true,
    flight: createFlightState({ position: pos, headingRad, speed: 200 }),
    config: getAircraft(team === 'usa' ? 'kestrel' : 'kobchik'),
    input: neutralInput(),
  });
  const deck = new CloudField(WEATHER.overcast, 1);

  it('hides an aircraft above the deck from the eye but not from radar', () => {
    const me = jet(1, 'usa', v(0, 800, 0), 90 * DEG);
    const above = jet(2, 'russia', v(3000, 3000, 0), 270 * DEG);
    const out: Contact[] = [];
    detectContacts(me, [me, above], flat, out, null);
    expect(out[0]).toMatchObject({ visual: true, radar: true });
    detectContacts(me, [me, above], flat, out, deck);
    expect(out[0]).toMatchObject({ visual: false, radar: true });
  });

  it('lets an infrared seeker lock only on what it can see', () => {
    const me = jet(1, 'usa', v(0, 800, 0), 90 * DEG);
    const ahead = jet(2, 'russia', v(2500, 1000, 0), 90 * DEG);
    const seeker = createSeeker();
    updateSeeker(seeker, me, [ahead], null, SRM_DART, flat, 1 / 60, deck);
    expect(seeker.mode).toBe('track');
    ahead.flight.pos.set(2500, 2500, 0);
    const blind = createSeeker();
    updateSeeker(blind, me, [ahead], null, SRM_DART, flat, 1 / 60, deck);
    expect(blind.mode).toBe('search');
  });
});

describe('time of day (spec §12.3)', () => {
  const sun = new Vector3();
  const elevation = (d: Vector3) => Math.asin(d.y) / DEG;

  it('puts the sun due south at about 38° at noon, rising in the east at 06:00 and setting in the west at 18:00', () => {
    sunDirection(12, sun);
    expect(elevation(sun)).toBeCloseTo(38, 0);
    expect(sun.z).toBeGreaterThan(0.7);
    sunDirection(6, sun);
    expect(elevation(sun)).toBeCloseTo(0, 3);
    expect(sun.x).toBeCloseTo(1, 3);
    sunDirection(18, sun);
    expect(sun.x).toBeCloseTo(-1, 3);
    sunDirection(0, sun);
    expect(elevation(sun)).toBeLessThan(-30);
    moonDirection(0, sun);
    expect(elevation(sun)).toBeCloseTo(38, 0);
  });

  it('runs the clock at one game hour per real minute, or holds it', () => {
    expect(hourAt(12, true, 60)).toBeCloseTo(13, 9);
    expect(hourAt(23, true, 120)).toBeCloseTo(1, 9);
    expect(hourAt(12, false, 600)).toBe(12);
    expect(START_HOURS.night).toBeGreaterThan(18);
    expect(CALM_NOON).toEqual({ weather: 'clear', startHour: 12, clockRunning: false });
  });

  it('fades daylight through twilight', () => {
    expect(daylight(30 * DEG)).toBe(1);
    expect(daylight(-10 * DEG)).toBe(0);
    expect(daylight(0)).toBeCloseTo(0.5, 9);
  });
});
