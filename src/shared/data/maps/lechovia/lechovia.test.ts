import { describe, expect, it } from 'vitest';
import { airfieldLocal, AIRFIELD_GROUND_HALF_WIDTH_M, AIRFIELD_GROUND_OVERRUN_M, airfieldGroundAt } from '../../../map/features.ts';
import { COVER_CODE, type LandCover, WATER_COVERS } from '../../../map/land-cover.ts';
import { buildTerrain } from '../map-definition.ts';
import { createLechovia, generateLechovia, LECHOVIA_RESOLUTION } from './index.ts';
import { CITY_NAMES, foldName, REAL_CITIES } from './names.ts';

const def = createLechovia(1);
const terrain = buildTerrain(def);
const features = def.features!;
const N = LECHOVIA_RESOLUTION;

describe('Lechovia (spec §12.3)', () => {
  it('is 200 km square on a 2049² grid and the same for the same seed', () => {
    expect(def.sizeM).toBe(200000);
    expect(terrain.resolution).toBe(2049);
    const again = generateLechovia(1);
    let same = true;
    for (let k = 0; k < again.heights.length; k += 997) same &&= again.heights[k] === terrain.heights[k];
    expect(same).toBe(true);
    expect(again.features).toEqual(features);
  }, 30000);

  it('has a sea along the north and peaks of about 2,400 m in the south', () => {
    for (let x = -95000; x <= 95000; x += 5000) expect(terrain.heightAt(x, -95000)).toBeLessThan(0);
    let peak = 0;
    for (let x = -98000; x <= 98000; x += 400) for (let z = 60000; z <= 98000; z += 400) peak = Math.max(peak, terrain.heightAt(x, z));
    expect(peak).toBeGreaterThan(2200);
    expect(peak).toBeLessThan(2800);
    // The central plains stay low.
    let plain = 0;
    for (let x = -40000; x <= 40000; x += 2000) for (let z = -30000; z <= 30000; z += 2000) plain = Math.max(plain, terrain.heightAt(x, z));
    expect(plain).toBeLessThan(320);
  });

  it('has a lagoon behind a sand spit in the north-east', () => {
    let lagoon = 0;
    for (let x = 28000; x <= 50000; x += 2000) {
      // Going south from the open sea: sea, then dry spit, then lagoon water, then the mainland.
      const column: LandCover[] = [];
      for (let z = -86000; z <= -66000; z += 100) column.push(def.landCover(x, z, 0, 0));
      const firstLand = column.findIndex((c) => !WATER_COVERS.has(c));
      const water = column.slice(firstLand).findIndex((c) => WATER_COVERS.has(c));
      if (firstLand > 0 && water > 0) lagoon++;
    }
    expect(lagoon).toBeGreaterThanOrEqual(10);
  });

  it('runs two rivers from the south down to the sea, never climbing', () => {
    expect(features.rivers.map((r) => r.name)).toEqual(['Lechna', 'Odrawa']);
    for (const r of features.rivers) {
      const levels: number[] = [];
      for (let p = 0; p < r.points.length; p += 2) levels.push(terrain.heightAt(r.points[p], r.points[p + 1]));
      expect(r.points[1]).toBeGreaterThan(80000);
      expect(levels.at(-1)).toBeLessThanOrEqual(0.5);
      for (let k = 1; k < levels.length; k++) expect(levels[k], `${r.name} at ${k}`).toBeLessThanOrEqual(levels[k - 1] + 3);
    }
  });

  it('has dozens of lakes in the north-east lake district', () => {
    const seen = new Uint8Array(N * N);
    let lakes = 0;
    const cell = 200000 / (N - 1);
    const i0 = Math.round((20000 + 100000) / cell);
    const i1 = Math.round((95000 + 100000) / cell);
    const j0 = Math.round((-72000 + 100000) / cell);
    const j1 = Math.round((-18000 + 100000) / cell);
    const cover = (i: number, j: number) => def.landCover(-100000 + i * cell, -100000 + j * cell, 0, 0);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (seen[j * N + i] || cover(i, j) !== 'lake') continue;
        lakes++;
        const stack = [[i, j]];
        seen[j * N + i] = 1;
        while (stack.length > 0) {
          const [a, b] = stack.pop()!;
          for (const [c, d] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) {
            if (seen[d * N + c] || cover(c, d) !== 'lake') continue;
            seen[d * N + c] = 1;
            stack.push([c, d]);
          }
        }
      }
    }
    expect(lakes).toBeGreaterThanOrEqual(24);
  });

  it('places five curated cities, the capital on the great river, and about 60 villages on dry land', () => {
    const cities = features.settlements.filter((s) => s.kind === 'city');
    const villages = features.settlements.filter((s) => s.kind === 'village');
    expect(cities.map((c) => c.name)).toEqual([...CITY_NAMES]);
    expect(cities.filter((c) => c.capital).map((c) => c.name)).toEqual(['Lechów']);
    expect(villages.length).toBeGreaterThanOrEqual(50);
    const capital = cities[0];
    let riverNear = false;
    for (let a = 0; a < 64; a++) {
      const r = capital.radiusM * 0.5;
      if (def.landCover(capital.x + Math.cos(a) * r, capital.z + Math.sin(a) * r, 0, 0) === 'river') riverNear = true;
    }
    expect(riverNear).toBe(true);
    for (const v of villages) {
      for (let a = 0; a < 16; a++) {
        const x = v.x + Math.cos((a / 16) * 2 * Math.PI) * v.radiusM;
        const z = v.z + Math.sin((a / 16) * 2 * Math.PI) * v.radiusM;
        expect(WATER_COVERS.has(def.landCover(x, z, 0, 0)), `${v.name} is wet`).toBe(false);
      }
      expect(def.landCover(v.x, v.z, 0, 0)).toBe('urban');
    }
  });

  it('gives every place a fictional, unique name', () => {
    const names = features.settlements.map((s) => foldName(s.name));
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(REAL_CITIES.has(n), n).toBe(false);
  });

  it('connects every city, village and airfield by road', () => {
    const roads = features.roads;
    expect(roads.filter((r) => r.kind === 'highway').length).toBeGreaterThanOrEqual(5);
    // Roads join when an end of one lies on (within 400 m of) a point of another.
    const parent = roads.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const near = (x: number, z: number, r: (typeof roads)[number], m: number) => {
      for (let p = 0; p < r.points.length; p += 2) if (Math.hypot(r.points[p] - x, r.points[p + 1] - z) < m) return true;
      return false;
    };
    roads.forEach((a, i) => {
      const ends = [
        [a.points[0], a.points[1]],
        [a.points.at(-2)!, a.points.at(-1)!],
      ];
      roads.forEach((b, j) => {
        if (i !== j && ends.some(([x, z]) => near(x, z, b, 400))) parent[find(i)] = find(j);
      });
    });
    expect(new Set(roads.map((_, i) => find(i))).size).toBe(1);
    for (const s of features.settlements) expect(roads.some((r) => near(s.x, s.z, r, s.radiusM + 800)), s.name).toBe(true);
    for (const a of features.airfields) expect(roads.some((r) => near(a.x, a.z, r, 1500)), a.name).toBe(true);
  });

  it('has four flat, dry airfields: USA in the west, Russia in the east, two neutral', () => {
    const fields = features.airfields;
    expect(fields.map((a) => a.team)).toEqual(['usa', 'russia', null, null]);
    expect(fields[0].x).toBeLessThan(-40000);
    expect(fields[1].x).toBeGreaterThan(40000);
    for (const a of fields) {
      expect(Math.hypot(a.x - def.combatArea.x, a.z - def.combatArea.z) + a.lengthM / 2).toBeLessThan(def.combatArea.radiusM);
      // 1 m inside the edges, clear of rounding.
      const halfL = a.lengthM / 2 + AIRFIELD_GROUND_OVERRUN_M - 1;
      const halfW = AIRFIELD_GROUND_HALF_WIDTH_M - 1;
      for (let u = -halfL; u <= halfL; u += halfL / 40) {
        for (let v = -halfW; v <= halfW; v += halfW / 9) {
          const d = { x: Math.sin(a.headingRad), z: -Math.cos(a.headingRad) };
          const x = a.x + d.x * u - d.z * v;
          const z = a.z + d.z * u + d.x * v;
          expect(Math.abs(terrain.heightAt(x, z) - a.elevationM)).toBeLessThan(0.05);
          expect(def.landCover(x, z, 0, 0)).toBe('airfield');
          expect(airfieldGroundAt(fields, x, z)).toBe(a);
        }
      }
      const { u, v } = airfieldLocal(a, a.x, a.z);
      expect(Math.abs(u) + Math.abs(v)).toBe(0);
    }
    expect(COVER_CODE.airfield).toBeGreaterThan(0);
  });

  it('spawns both teams inside the combat area, well above the ground', () => {
    for (const team of ['usa', 'russia'] as const) {
      const s = def.spawns[team];
      expect(Math.hypot(s.x - def.combatArea.x, s.z - def.combatArea.z)).toBeLessThan(def.combatArea.radiusM);
      expect(s.altitudeM - terrain.heightAt(s.x, s.z)).toBeGreaterThan(1500);
    }
    expect(def.combatArea.radiusM * 2).toBeLessThan(def.sizeM);
  });
});
