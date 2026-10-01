import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { loadFactorFromVelocity, TrailRibbons, TrailStore } from './trails.ts';

const look = { lifeS: 10, sampleS: 0.5, width0: 1, width1: 10, alpha: 0.8, fadeInS: 0.1, maxPoints: 30, color: new Color(1, 1, 1) };

describe('trail bookkeeping (M5)', () => {
  it('samples an emitter at its rate and runs the newest segment up to the emitter', () => {
    const s = new TrailStore(look);
    for (let i = 0; i <= 20; i++) s.emit('a', { x: i * 25, y: 9000, z: 0 }, 1, i * 0.1);
    const [trail] = [...s.trails()];
    // Points at 0, 0.5, 1.0, 1.5 and 2.0 s; the emitter's last position equals the last sample.
    expect(trail.map((p) => p.t)).toEqual([0, 0.5, 1, 1.5, 2]);
    s.emit('a', { x: 600, y: 9000, z: 0 }, 1, 2.2);
    expect([...s.trails()][0].at(-1)).toMatchObject({ x: 600, t: 2.2 });
  });

  it('ages points out, and starts a new trail after a pause instead of bridging it', () => {
    const s = new TrailStore(look);
    s.emit('a', { x: 0, y: 0, z: 0 }, 1, 0);
    s.emit('a', { x: 10, y: 0, z: 0 }, 1, 0.5);
    s.emit('a', { x: 20, y: 0, z: 0 }, 0, 1);
    s.emit('a', { x: 500, y: 0, z: 0 }, 1, 5);
    s.emit('a', { x: 510, y: 0, z: 0 }, 1, 5.5);
    expect(s.count).toBe(2);
    s.age(10.3);
    // The first trail's points are older than 10 s: gone.
    expect(s.count).toBe(1);
    s.age(16);
    expect(s.count).toBe(0);
  });

  it('keeps at most maxPoints per trail', () => {
    const s = new TrailStore({ ...look, maxPoints: 4 });
    for (let i = 0; i < 10; i++) s.emit('a', { x: i, y: 0, z: 0 }, 1, i);
    expect([...s.trails()][0]).toHaveLength(4);
  });

  it('draws two triangles per segment, within its capacity', () => {
    const r = new TrailRibbons(look, 3);
    for (let i = 0; i < 8; i++) r.store.emit('a', { x: i * 100, y: 0, z: 0 }, 1, i * 0.5);
    r.update(4, { pixelScale: 1000, fogColor: new Color(), fogDensity: 0 }, 1);
    expect(r.mesh.geometry.drawRange.count).toBe(18);
    r.dispose();
  });

  it('estimates the load factor from the velocity change', () => {
    // Level flight: 1 G.
    expect(loadFactorFromVelocity(new Vector3(200, 0, 0), new Vector3(200, 0, 0), 0.1, 0, 1, 0)).toBeCloseTo(1, 6);
    // Pulling up at 5 G-worth of upward acceleration.
    expect(loadFactorFromVelocity(new Vector3(200, 0, 0), new Vector3(200, 4 * 9.80665 * 0.1, 0), 0.1, 0, 1, 0)).toBeCloseTo(5, 6);
  });
});
