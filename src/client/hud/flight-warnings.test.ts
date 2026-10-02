import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../input/bindings.ts';
import { formatFuel, formatWind, spinHint } from './flight-warnings.ts';

describe('fuel, wind and spin on the HUD (revision 16)', () => {
  it('shows fuel as a whole percentage that reads 0 only when empty', () => {
    expect(formatFuel(3200, 3200)).toBe('FUEL 100%');
    expect(formatFuel(1150, 3200)).toBe('FUEL 35%');
    expect(formatFuel(5, 3200)).toBe('FUEL 1%');
    expect(formatFuel(0, 3200)).toBe('FUEL 0%');
  });

  it('reads the wind as the bearing it blows from and its speed', () => {
    // Air moving east (+x) comes from the west.
    expect(formatWind(10, 0, 'metric')).toBe('WIND 270° 36 KM/H');
    // Air moving south (+z) comes from the north: 360, not 000.
    expect(formatWind(0, 10, 'imperial')).toBe('WIND 360° 19 KT');
    expect(formatWind(-5, 0, 'imperial')).toBe('WIND 090° 10 KT');
    expect(formatWind(0.2, 0.1, 'metric')).toBe('WIND CALM');
  });

  it('tells keyboard pilots how to recover from a spin, and mouse-aim pilots that it is automatic', () => {
    expect(spinHint('mouse-aim', 1, DEFAULT_BINDINGS, false)).toBe('AUTO RECOVERY');
    expect(spinHint('mouse-aim', 1, DEFAULT_BINDINGS, true)).toBe('AUTO RECOVERY');
    expect(spinHint('direct', 1, DEFAULT_BINDINGS, false)).toBe('W NOSE DOWN · Q RUDDER · LET GO OF THE ROLL');
    expect(spinHint('direct', -1, DEFAULT_BINDINGS, false)).toContain('E RUDDER');
    expect(spinHint('direct', 1, DEFAULT_BINDINGS, true)).toBe('STICK FORWARD · LB RUDDER');
  });
});
