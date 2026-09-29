import { describe, expect, it } from 'vitest';
import { FixedStepper } from './fixed-stepper.ts';

describe('FixedStepper', () => {
  const dt = 1 / 60;
  it('runs one step per fixed interval', () => {
    const s = new FixedStepper(dt);
    let n = 0;
    expect(s.advance(dt, () => n++)).toBe(1);
    expect(n).toBe(1);
  });
  it('accumulates partial frames', () => {
    const s = new FixedStepper(dt);
    let n = 0;
    s.advance(dt / 2, () => n++);
    expect(n).toBe(0);
    expect(s.alpha).toBeCloseTo(0.5, 6);
    s.advance(dt / 2, () => n++);
    expect(n).toBe(1);
  });
  it('caps the steps per frame and drops the backlog', () => {
    const s = new FixedStepper(dt, 5);
    let n = 0;
    expect(s.advance(1, () => n++)).toBe(5);
    expect(s.alpha).toBeLessThan(1);
  });
  it('ignores negative frame times', () => {
    const s = new FixedStepper(dt);
    expect(s.advance(-1, () => undefined)).toBe(0);
  });
});
