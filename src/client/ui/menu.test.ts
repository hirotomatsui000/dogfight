import { describe, expect, it } from 'vitest';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import { sanitizeCallsign, statsFor } from './menu.ts';

describe('start menu helpers', () => {
  it('cleans callsigns', () => {
    expect(sanitizeCallsign('  Ace<script>  ')).toBe('Acescript');
    expect(sanitizeCallsign('a very long callsign indeed')).toBe('a very long call');
    expect(sanitizeCallsign('!!!')).toBe('Pilot');
  });

  it('shows missiles and the helmet sight on the aircraft cards', () => {
    const kobchik = Object.fromEntries(statsFor(getAircraft('kobchik')));
    expect(kobchik.Missiles).toBe('4 short-range · helmet sight');
    expect(Object.fromEntries(statsFor(getAircraft('kestrel'))).Missiles).toBe('4 short-range');
  });
});
