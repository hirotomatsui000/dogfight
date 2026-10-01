import { describe, expect, it } from 'vitest';
import { kestrel } from '../../shared/data/aircraft/kestrel.ts';
import { kobchik } from '../../shared/data/aircraft/kobchik.ts';
import { STRIKE_DEFAULTS } from '../../shared/modes/strike.ts';
import { DEFAULT_BINDINGS, rebind } from '../input/bindings.ts';
import { controlsHelp } from './controls-help.ts';
import { aircraftSummary, effectiveWorld, environmentOf, pickValid, sanitizeCallsign, strikeRole, type WorldChoice } from './menu.ts';

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
    expect(aircraftSummary({ ...kestrel, description: 'Rolls faster than anything. Lightly built.' })).toBe('Light multirole fighter · Rolls faster than anything.');
    expect(aircraftSummary({ ...kestrel, description: 'A test jet' })).toBe('Light multirole fighter · A test jet');
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
      for (const needed of ['Cannon', 'Flares and chaff', 'Pause']) expect(actions).toContain(needed);
      expect(actions.some((a) => a.startsWith('Missile'))).toBe(true);
      expect(actions.some((a) => a.startsWith('Bomb'))).toBe(true);
    }
  });
});

describe('strike role', () => {
  it('tells each jet what it does in a Strike match', () => {
    expect(strikeRole(kestrel)).toBe('Kestrel · USA: hold all three targets for 9 minutes');
    expect(strikeRole(kobchik)).toBe('Kobchik · Russia: destroy two of the three targets');
    // the words above are written out, so they must follow the rules
    expect([STRIKE_DEFAULTS.timeLimitS, STRIKE_DEFAULTS.targetsToWin]).toEqual([540, 2]);
  });
});

describe('controls list with rebound keys', () => {
  it('shows the keys the player chose', () => {
    const rows = controlsHelp('direct', rebind(DEFAULT_BINDINGS, 'flares', 'KeyV'));
    expect(rows.find(([, a]) => a === 'Flares and chaff')?.[0]).toBe('V');
  });
});

describe('world choice (M4)', () => {
  const choice: WorldChoice = { map: 'lechovia', start: 'runway', time: 'dusk', clock: false, weather: 'rain' };

  it('keeps the chosen map and runway start for a dogfight or free flight', () => {
    expect(effectiveWorld(choice, 'team-deathmatch')).toEqual(choice);
    expect(effectiveWorld(choice, 'free-flight')).toEqual(choice);
  });

  it('flies Strike and Training on the Test Range from the air', () => {
    for (const m of ['strike', 'training'] as const) expect(effectiveWorld(choice, m)).toMatchObject({ map: 'test-range', start: 'air' });
    expect(effectiveWorld({ ...choice, map: 'test-range' }, 'team-deathmatch').start).toBe('air');
  });

  it('turns the choice into the weather and clock of the match', () => {
    expect(environmentOf(choice)).toEqual({ weather: 'rain', startHour: 17.5, clockRunning: false });
  });
});
