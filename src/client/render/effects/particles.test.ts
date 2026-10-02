import { Color, Vector3 } from 'three';
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

describe('particle density', () => {
  it('keeps an even share of spawns at reduced density', () => {
    const ps = new ParticleSystem(100, false);
    ps.density = 0.5;
    for (let i = 0; i < 20; i++) ps.spawn(puff());
    expect(ps.liveCount).toBe(10);
  });
});

describe('particles in the wind', () => {
  it('lets drag carry smoke along with the wind instead of stopping it (revision 16)', () => {
    const ps = new ParticleSystem(1, false);
    ps.spawn({ ...puff(), vx: 0, lift: 0, drag: 2 });
    const wind = { steadyAt: (_y: number, out: Vector3) => out.set(0, 0, 8) };
    for (let i = 0; i < 30; i++) ps.update(0.02, { ...frame, wind });
    const pos = ps.points.geometry.getAttribute('position');
    // Drag 2 brings it up to the wind's 8 m/s: 8 × (0.6 − (1 − e^−1.2) / 2) ≈ 2.0 m in 0.6 s.
    expect(pos.getZ(0)).toBeCloseTo(2, 0);
    expect(pos.getX(0)).toBeCloseTo(0, 6);
  });
});
