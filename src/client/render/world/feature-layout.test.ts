import { describe, expect, it } from 'vitest';
import { createLechovia } from '../../../shared/data/maps/lechovia/index.ts';
import { buildTerrain } from '../../../shared/data/maps/map-definition.ts';
import { AIRFIELD_GROUND_HALF_WIDTH_M, AIRFIELD_GROUND_OVERRUN_M } from '../../../shared/map/features.ts';
import { airfieldLayout, buildingCount, type Ground, placeBuildings, roadCells, roadRibbon, runwayNumber } from './feature-layout.ts';

const map = createLechovia();
const terrain = buildTerrain(map);
const features = map.features!;
const ground: Ground = { heightAt: (x, z) => terrain.heightAt(x, z), coverAt: (x, z) => map.landCover(x, z, 0, 0) };
const cells = roadCells(features.roads);

describe('settlement buildings (spec §12.3)', () => {
  it('fills the capital with thousands of buildings and villages with a few dozen houses', () => {
    const capital = features.settlements[0];
    const village = features.settlements.find((s) => s.kind === 'village')!;
    const big = placeBuildings(capital, ground, cells);
    const small = placeBuildings(village, ground, cells);
    expect(big.length).toBeGreaterThan(buildingCount(capital) * 0.8);
    expect(small.length).toBeGreaterThan(20);
    expect(small.every((b) => b.roof === 'pitched')).toBe(true);
    expect(big.some((b) => b.roof === 'flat' && b.height > 30)).toBe(true);
    expect(placeBuildings(capital, ground, cells)).toEqual(big);
  });

  it('builds only on town ground, never on water or roads', () => {
    for (const s of features.settlements.slice(0, 12)) {
      for (const b of placeBuildings(s, ground, cells)) {
        expect(ground.coverAt(b.x, b.z)).toBe('urban');
        expect(cells.has(`${Math.floor(b.x / 40)},${Math.floor(b.z / 40)}`)).toBe(false);
        expect(b.y).toBeCloseTo(terrain.heightAt(b.x, b.z), 6);
      }
    }
  });
});

describe('roads (spec §12.3)', () => {
  it('drapes a ribbon of the right width over the ground and bridges rivers level', () => {
    let bridged = false;
    for (const road of features.roads.filter((r) => r.kind === 'highway')) {
      const ribbon = roadRibbon(road, ground, 12);
      for (let i = 0; i < ribbon.length; i += 6) {
        const width = Math.hypot(ribbon[i + 3] - ribbon[i], ribbon[i + 5] - ribbon[i + 2]);
        expect(width).toBeCloseTo(12, 1);
        const x = (ribbon[i] + ribbon[i + 3]) / 2;
        const z = (ribbon[i + 2] + ribbon[i + 5]) / 2;
        expect(ribbon[i + 1]).toBeGreaterThanOrEqual(terrain.heightAt(x, z) + 0.99);
        if (ground.coverAt(x, z) === 'river') bridged = true;
      }
    }
    expect(bridged).toBe(true);
  });
});

describe('airfields (spec §12.3)', () => {
  it('keeps the runway, taxiways, apron, hangars and tower on the flattened ground', () => {
    for (const a of features.airfields) {
      const layout = airfieldLayout(a);
      for (const p of layout.paved) {
        expect(Math.abs(p.u) + p.length / 2).toBeLessThanOrEqual(a.lengthM / 2 + AIRFIELD_GROUND_OVERRUN_M);
        expect(Math.abs(p.v) + p.width / 2).toBeLessThanOrEqual(AIRFIELD_GROUND_HALF_WIDTH_M);
      }
      for (const h of [...layout.hangars, layout.tower]) expect(Math.abs(h.v) + 20).toBeLessThanOrEqual(AIRFIELD_GROUND_HALF_WIDTH_M);
      expect(layout.edgeLights.length).toBeGreaterThan(80);
      expect(layout.paved.filter((p) => p.kind === 'runway')).toHaveLength(1);
    }
  });

  it('names runways after their take-off heading', () => {
    expect(runwayNumber(Math.PI / 2)).toBe('09');
    expect(runwayNumber((3 * Math.PI) / 2)).toBe('27');
    expect(runwayNumber(0)).toBe('36');
    expect(runwayNumber((160 * Math.PI) / 180)).toBe('16');
  });
});
