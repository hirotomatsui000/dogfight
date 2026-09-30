import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { ParticleSystem } from './particles.ts';

const frame = { pixelScale: 800, fogColor: new Color(0.5, 0.5, 0.5), fogDensity: 0 };
const puff = (x = 0) => ({ x, y: 100, z: 0, vx: 10, vy: 0, vz: 0, lifeS: 1, size0: 2, size1: 6, color: new Color(1, 1, 1), alpha: 1, lift: 2 });

describe('ParticleSystem', () => {
  it('moves, grows and expires particles', () => {
    const ps = new ParticleSystem(8, false);
    ps.spawn(puff());
    expect(ps.liveCount).toBe(1);
    ps.update(0.5, frame);
    const pos = ps.points.geometry.getAttribute('position');
    expect(pos.getX(0)).toBeCloseTo(5, 6);
    expect(pos.getY(0)).toBeGreaterThan(100);
    expect(ps.points.geometry.getAttribute('aSize').getX(0)).toBeCloseTo(4, 6);
    ps.update(0.6, frame);
    expect(ps.liveCount).toBe(0);
    expect(ps.points.geometry.getAttribute('aSize').getX(0)).toBe(0);
  });

  it('reuses the oldest slot when full', () => {
    const ps = new ParticleSystem(2, true);
    ps.spawn(puff(1));
    ps.spawn(puff(2));
    ps.spawn(puff(3));
    expect(ps.liveCount).toBe(2);
    expect(ps.points.geometry.getAttribute('position').getX(0)).toBe(3);
  });

  it('fades in quickly and out slowly', () => {
    const ps = new ParticleSystem(1, false);
    ps.spawn(puff());
    ps.update(0.01, frame);
    const early = ps.points.geometry.getAttribute('aColor').getW(0);
    ps.update(0.2, frame);
    const mid = ps.points.geometry.getAttribute('aColor').getW(0);
    ps.update(0.7, frame);
    const late = ps.points.geometry.getAttribute('aColor').getW(0);
    expect(mid).toBeGreaterThan(early);
    expect(late).toBeLessThan(mid);
  });
});
