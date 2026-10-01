import { describe, expect, it } from 'vitest';
import { DEG } from '../../shared/math/units.ts';
import { visibilityScale } from './visibility.ts';

describe('visibilityScale', () => {
  it('leaves nearby objects at their real size', () => {
    // A 15 m jet at 500 m spans 1.7 degrees, well above a 0.7 degree minimum.
    expect(visibilityScale(500, 15, 0.7 * DEG, 8)).toBe(1);
  });

  it('enlarges a distant object so it keeps the minimum apparent size', () => {
    // At 4 km a 15 m jet would span 0.21 degrees; it must be drawn about 3.3 times larger to span 0.7.
    const scale = visibilityScale(4000, 15, 0.7 * DEG, 8);
    expect(scale).toBeCloseTo((4000 * Math.tan(0.7 * DEG)) / 15, 6);
    expect(scale).toBeGreaterThan(3);
  });

  it('never enlarges beyond the cap', () => {
    expect(visibilityScale(40000, 15, 0.7 * DEG, 8)).toBe(8);
  });
});
