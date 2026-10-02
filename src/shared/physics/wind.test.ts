import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEG } from '../math/units.ts';
import { WEATHER, WEATHER_IDS } from '../world/weather.ts';
import { WindField } from './wind.ts';

const field = (gust = 0.3, seed = 7) => new WindField({ surfaceMs: 10, aloftMs: 30, gust, fromRad: 270 * DEG }, seed);
const bearing = (v: Vector3) => Math.atan2(v.x, -v.z);

describe('wind (revision 16)', () => {
  it('blows from the given direction: a west wind moves the air east', () => {
    const v = field(0).steadyAt(0, new Vector3());
    expect(v.x).toBeCloseTo(10, 9);
    expect(v.y).toBe(0);
    expect(v.z).toBeCloseTo(0, 9);
  });

  it('keeps its surface speed low down, then strengthens and veers 30° up to 11 km', () => {
    const w = field(0);
    expect(w.speedAt(500)).toBe(10);
    expect(w.speedAt(6000)).toBeGreaterThan(10);
    expect(w.speedAt(6000)).toBeLessThan(30);
    expect(w.speedAt(12000)).toBe(30);
    const low = w.steadyAt(0, new Vector3());
    const high = w.steadyAt(12000, new Vector3());
    expect(high.length()).toBeCloseTo(30, 9);
    // Veering is clockwise: the air's direction of travel turns from east toward south.
    expect(bearing(high) - bearing(low)).toBeCloseTo(30 * DEG, 9);
  });

  it('adds gusts that stay within their share of the wind and change along the path and in time', () => {
    const w = field(0.3);
    const steady = new Vector3();
    const gusty = new Vector3();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const pos = new Vector3(i * 137, 3000, -i * 91);
      w.at(pos, i * 0.37, gusty);
      w.steadyAt(pos.y, steady);
      expect(gusty.distanceTo(steady)).toBeLessThanOrEqual(0.3 * w.speedAt(pos.y) * Math.SQRT2 + 1e-9);
      seen.add(gusty.x.toFixed(1));
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it('is the same for the same seed and different for another', () => {
    const p = new Vector3(1234, 2000, -567);
    expect(field(0.3, 5).at(p, 12.5, new Vector3()).toArray()).toEqual(field(0.3, 5).at(p, 12.5, new Vector3()).toArray());
    expect(field(0.3, 5).at(p, 12.5, new Vector3()).x).not.toBe(field(0.3, 6).at(p, 12.5, new Vector3()).x);
  });

  it('gives each weather a westerly-ish wind, stronger and gustier in bad weather', () => {
    for (const id of WEATHER_IDS) {
      const w = WindField.forWeather(WEATHER[id], 99);
      const from = w.settings.fromRad / DEG;
      expect(from).toBeGreaterThanOrEqual(200);
      expect(from).toBeLessThanOrEqual(340);
    }
    expect(WEATHER.rain.windMs).toBeGreaterThan(WEATHER.clear.windMs);
    expect(WEATHER.rain.gust).toBeGreaterThan(WEATHER.clear.gust);
  });
});
