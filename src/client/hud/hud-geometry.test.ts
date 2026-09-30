import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEG } from '../../shared/math/units.ts';
import { closureRate, edgeMarker, scopePoint, scopeScale } from './hud-geometry.ts';

describe('HUD geometry', () => {
  it('pins off-screen arrows to the screen edge in the right direction', () => {
    const m = { x: 0, y: 0, angle: 0 };
    expect(edgeMarker(1, 0, 1000, 600, 40, m)).toEqual({ x: 960, y: 300, angle: 0 });
    edgeMarker(0, -5, 1000, 600, 40, m);
    expect(m.x).toBeCloseTo(500, 9);
    expect(m.y).toBeCloseTo(40, 9);
    expect(m.angle).toBeCloseTo(-Math.PI / 2, 9);
    edgeMarker(1, 1, 1000, 600, 40, m);
    expect(m.y).toBeCloseTo(560, 9);
    expect(m.x).toBeCloseTo(760, 9);
  });

  it('picks the smallest radar scale that fits', () => {
    expect(scopeScale(null)).toBe(40000);
    expect(scopeScale(5000)).toBe(10000);
    expect(scopeScale(8500)).toBe(10000);
    expect(scopeScale(9000)).toBe(20000);
    expect(scopeScale(200000)).toBe(80000);
  });

  it('draws the scope heading-up', () => {
    const out = { x: 0, y: 0 };
    // heading north, contact 10 km north: straight up, half way out on a 20 km scale
    expect(scopePoint(0, -10000, 0, 20000, 100, out)).toBe(true);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(-50, 9);
    // heading east: a contact to the east is ahead, one to the north is on the left
    scopePoint(10000, 0, 90 * DEG, 20000, 100, out);
    expect(out.y).toBeCloseTo(-50, 9);
    scopePoint(0, -10000, 90 * DEG, 20000, 100, out);
    expect(out.x).toBeCloseTo(-50, 9);
    expect(scopePoint(0, -30000, 0, 20000, 100, out)).toBe(false);
  });

  it('measures closure rate', () => {
    const origin = new Vector3();
    expect(closureRate(origin, new Vector3(0, 0, -200), new Vector3(0, 0, -1000), new Vector3(0, 0, 100))).toBeCloseTo(300, 9);
    expect(closureRate(origin, new Vector3(), new Vector3(0, 0, -1000), new Vector3(0, 0, -50))).toBeCloseTo(-50, 9);
  });
});
