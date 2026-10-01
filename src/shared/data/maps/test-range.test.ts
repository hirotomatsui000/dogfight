import { describe, expect, it } from 'vitest';
import { buildTerrain } from './map-definition.ts';
import { createTestRange } from './test-range.ts';

describe('test range', () => {
  const def = createTestRange(1);
  const terrain = buildTerrain(def);

  it('is deterministic per seed', () => {
    const again = buildTerrain(createTestRange(1));
    const other = buildTerrain(createTestRange(2));
    expect(again.heightAt(1234, -4321)).toBe(terrain.heightAt(1234, -4321));
    expect(other.heightAt(1234, -4321)).not.toBe(terrain.heightAt(1234, -4321));
  });
  it('has sea along the north edge', () => {
    expect(terrain.heightAt(0, -28000)).toBeLessThan(0);
    expect(def.landCover(0, -28000, terrain.heightAt(0, -28000), 0)).toBe('sea');
  });
  it('has a mountain ridge in the south', () => {
    let max = 0;
    for (let x = -28000; x <= 28000; x += 500) {
      for (let z = 15000; z <= 28000; z += 500) max = Math.max(max, terrain.heightAt(x, z));
    }
    expect(max).toBeGreaterThan(800);
  });
  it('has a flat lake lower than its shore', () => {
    const lake = def.landCover(-9000, -6000, terrain.heightAt(-9000, -6000), 0);
    expect(lake).toBe('lake');
    const level = terrain.heightAt(-9000, -6000);
    expect(terrain.heightAt(-8500, -6000)).toBeCloseTo(level, 1);
    expect(terrain.heightAt(-9000 + 2600, -6000)).toBeGreaterThan(level);
  });
  it('carves a river lower than the land around it', () => {
    let lower = 0;
    for (let z = -15000; z <= 15000; z += 3000) {
      const riverX = findLowest(terrain, z);
      if (terrain.heightAt(riverX, z) < terrain.heightAt(riverX + 2500, z)) lower++;
    }
    expect(lower).toBeGreaterThanOrEqual(9);
  });
  it('spawns both teams inside the combat area, well above the ground', () => {
    for (const team of ['usa', 'russia'] as const) {
      const s = def.spawns[team];
      expect(Math.hypot(s.x - def.combatArea.x, s.z - def.combatArea.z)).toBeLessThan(def.combatArea.radiusM);
      expect(s.altitudeM - terrain.heightAt(s.x, s.z)).toBeGreaterThan(1500);
    }
    expect(def.combatArea.radiusM * 2).toBeLessThan(def.sizeM);
  });

  it('places three Strike targets on flat dry land about 8 km apart, well inside the combat area', () => {
    const layout = def.strike;
    if (!layout) throw new Error('the test range needs a Strike layout');
    expect(layout.targets.map((t) => [t.id, t.kind])).toEqual([
      ['A', 'depot'],
      ['B', 'radar'],
      ['C', 'fuel'],
    ]);
    for (const t of layout.targets) {
      expect(terrain.heightAt(t.x, t.z)).toBeGreaterThan(5);
      expect(1 - terrain.normalAt(t.x, t.z).y).toBeLessThan(0.01);
      expect(Math.hypot(t.x - def.combatArea.x, t.z - def.combatArea.z)).toBeLessThan(def.combatArea.radiusM - 5000);
    }
    const [a, b, c] = layout.targets;
    for (const [p, q] of [
      [a, b],
      [b, c],
    ]) {
      expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(7000);
      expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThan(9000);
    }
  });

  it('spawns the USA 8 km west of the targets and Russia 24 km east, both facing them', () => {
    const layout = def.strike;
    if (!layout) throw new Error('the test range needs a Strike layout');
    const lineX = layout.targets.reduce((sum, t) => sum + t.x, 0) / layout.targets.length;
    const { usa, russia } = layout.spawns;
    expect(lineX - usa.x).toBeGreaterThan(7000);
    expect(lineX - usa.x).toBeLessThan(9000);
    expect(russia.x - lineX).toBeGreaterThan(23000);
    expect(russia.x - lineX).toBeLessThan(25000);
    expect([usa.headingRad, russia.headingRad]).toEqual([Math.PI / 2, (3 * Math.PI) / 2]);
    expect([usa.altitudeM, russia.altitudeM]).toEqual([4000, 5000]);
    for (const s of [usa, russia]) expect(Math.hypot(s.x - def.combatArea.x, s.z - def.combatArea.z)).toBeLessThan(def.combatArea.radiusM);
  });
});

/** The river meanders around x = 5 km; find the lowest point in that band for a given z. */
function findLowest(terrain: ReturnType<typeof buildTerrain>, z: number): number {
  let bestX = 0;
  let best = Infinity;
  for (let x = 1500; x <= 8500; x += 50) {
    const h = terrain.heightAt(x, z);
    if (h < best) {
      best = h;
      bestX = x;
    }
  }
  return bestX;
}
