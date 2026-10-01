import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../input/bindings.ts';
import { takeoffHint } from './takeoff.ts';

describe('take-off hint (M4)', () => {
  it('names the rotation speed in the jet units and the keys the player uses', () => {
    const imperial = takeoffHint('mouse-aim', 'imperial', DEFAULT_BINDINGS, false);
    expect(imperial).toContain('170 KT');
    expect(imperial).toContain('mouse up');
    expect(takeoffHint('direct', 'metric', DEFAULT_BINDINGS, false)).toContain('310 KM/H');
    expect(takeoffHint('direct', 'metric', DEFAULT_BINDINGS, false)).toMatch(/hold S\b/);
    expect(takeoffHint('mouse-aim', 'imperial', DEFAULT_BINDINGS, true)).toContain('left stick');
  });
});
