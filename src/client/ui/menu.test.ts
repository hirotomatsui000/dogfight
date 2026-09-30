import { describe, expect, it } from 'vitest';
import { kestrel } from '../../shared/data/aircraft/kestrel.ts';
import { controlsHelp } from './controls-help.ts';
import { aircraftSummary, pickValid, sanitizeCallsign } from './menu.ts';

describe('start menu helpers', () => {
  it('cleans callsigns', () => {
    expect(sanitizeCallsign('  Ace<script>  ')).toBe('Acescript');
    expect(sanitizeCallsign('a very long callsign indeed')).toBe('a very long call');
    expect(sanitizeCallsign('!!!')).toBe('Pilot');
  });

  it('falls back when a saved choice is no longer offered', () => {
    expect(pickValid('kobchik', ['kestrel', 'kobchik'], 'kestrel')).toBe('kobchik');
    expect(pickValid('f-16', ['kestrel', 'kobchik'], 'kestrel')).toBe('kestrel');
    expect(pickValid('', ['rookie', 'ace'], 'rookie')).toBe('rookie');
  });

  it('sums an aircraft up in the first sentence of its description', () => {
    expect(aircraftSummary({ ...kestrel, description: 'Rolls faster than anything. Lightly built.' })).toBe('Rolls faster than anything.');
    expect(aircraftSummary({ ...kestrel, description: 'A test jet' })).toBe('A test jet');
  });
});

describe('controls help', () => {
  const keys = (rows: ReturnType<typeof controlsHelp>) => rows.map(([k]) => k);

  it('leads with the mouse in mouse-aim mode and with the stick keys in keyboard mode', () => {
    expect(controlsHelp('mouse-aim')[0][0]).toBe('Mouse');
    expect(keys(controlsHelp('direct')).slice(0, 3)).toEqual(['W / S', 'A / D', 'Q / E']);
    expect(keys(controlsHelp('direct'))).not.toContain('Mouse');
  });

  it('lists the weapons and pause in both modes', () => {
    for (const mode of ['mouse-aim', 'direct'] as const) {
      const actions = controlsHelp(mode).map(([, a]) => a);
      for (const needed of ['Cannon', 'Flares', 'Pause']) expect(actions).toContain(needed);
      expect(actions.some((a) => a.startsWith('Missile'))).toBe(true);
    }
  });
});
