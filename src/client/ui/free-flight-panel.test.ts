import { describe, expect, it } from 'vitest';
import { nearestTimeOfDay } from './free-flight-panel.ts';

describe('Free Flight panel (M5)', () => {
  it('shows the clock as the nearest of the four times of day, across midnight too', () => {
    expect(nearestTimeOfDay(12.4)).toBe('day');
    expect(nearestTimeOfDay(7)).toBe('dawn');
    expect(nearestTimeOfDay(18.2)).toBe('dusk');
    expect(nearestTimeOfDay(1.5)).toBe('night');
  });
});
