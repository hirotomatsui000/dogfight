import { describe, expect, it } from 'vitest';
import { missileAdvice } from './missile-advice.ts';

describe('missileAdvice', () => {
  it('asks for a hard turn once the missile is 2 s or less from impact', () => {
    expect(missileAdvice(2)).toEqual({ text: 'TURN HARD NOW', urgent: true });
    expect(missileAdvice(0.4).urgent).toBe(true);
  });

  it('suggests flares and waiting while the missile is still far off in time', () => {
    expect(missileAdvice(4.5)).toEqual({ text: 'X  FLARES  ·  BREAK WHEN IT IS CLOSE', urgent: false });
    expect(missileAdvice(Infinity).urgent).toBe(false);
  });
});
