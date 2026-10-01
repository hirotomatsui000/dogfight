import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MotionHistory } from './history.ts';

const DT = 1 / 60;

describe('MotionHistory', () => {
  it('perceives straight flight exactly despite the delay', () => {
    const h = new MotionHistory(16);
    const vel = new Vector3(100, 0, -200);
    for (let i = 0; i < 10; i++) h.record(new Vector3(0, 1000, 0).addScaledVector(vel, i * DT), vel);
    const pos = new Vector3();
    const v = new Vector3();
    expect(h.perceive(6, DT, pos, v)).toBe(true);
    expect(pos.distanceTo(new Vector3(0, 1000, 0).addScaledVector(vel, 9 * DT))).toBeLessThan(1e-9);
    expect(v.toArray()).toEqual(vel.toArray());
  });

  it('reacts late to a change of direction', () => {
    const h = new MotionHistory(16);
    const pos = new Vector3();
    for (let i = 0; i < 10; i++) h.record(pos.set(i, 0, 0), new Vector3(60, 0, 0));
    h.record(pos.set(10, 0, 0), new Vector3(0, 60, 0));
    const seen = new Vector3();
    h.perceive(5, DT, seen, new Vector3());
    expect(seen.x).toBeCloseTo(5 + 5, 9);
    expect(seen.y).toBeCloseTo(0, 9);
    h.perceive(0, DT, seen, new Vector3());
    expect(seen.toArray()).toEqual([10, 0, 0]);
  });

  it('clamps to the oldest record, wraps around and can be reset', () => {
    const h = new MotionHistory(4);
    const seen = new Vector3();
    expect(h.perceive(0, DT, seen, new Vector3())).toBe(false);
    for (let i = 0; i < 6; i++) h.record(new Vector3(i, 0, 0), new Vector3());
    expect(h.length).toBe(4);
    h.perceive(10, DT, seen, new Vector3());
    expect(seen.x).toBe(2);
    h.reset();
    expect(h.length).toBe(0);
  });
});

describe('MotionHistory.positionAt', () => {
  it('returns recorded positions, clamped to the oldest', () => {
    const h = new MotionHistory(4);
    const v = new Vector3();
    for (let i = 0; i < 6; i++) h.record(new Vector3(i, 0, 0), v);
    const out = new Vector3();
    expect(h.positionAt(0, out) && out.x).toBe(5);
    expect(h.positionAt(2, out) && out.x).toBe(3);
    expect(h.positionAt(99, out) && out.x).toBe(2);
    expect(new MotionHistory().positionAt(0, out)).toBe(false);
  });
});
