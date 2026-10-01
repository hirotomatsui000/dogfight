import { describe, expect, it } from 'vitest';
import { actionsFor, BINDABLE_ACTIONS, canBind, DEFAULT_BINDINGS, keyLabel, keysLabel, rebind, sanitizeBindings } from './bindings.ts';

describe('key bindings', () => {
  it('binds every action to at least one key by default, with no key used twice', () => {
    const seen = new Map<string, string>();
    for (const action of BINDABLE_ACTIONS) {
      expect(DEFAULT_BINDINGS[action].length).toBeGreaterThan(0);
      for (const code of DEFAULT_BINDINGS[action]) {
        expect(seen.get(code), `${code} used by ${seen.get(code)} and ${action}`).toBeUndefined();
        seen.set(code, action);
      }
    }
  });

  it('makes the new key the primary and keeps the extras', () => {
    const b = rebind(DEFAULT_BINDINGS, 'pitchDown', 'KeyI');
    expect(b.pitchDown).toEqual(['KeyI', 'ArrowUp']);
  });

  it('swaps primaries when the key belongs to another action, so no action loses its last key', () => {
    const b = rebind(DEFAULT_BINDINGS, 'missile', 'Space');
    expect(b.missile[0]).toBe('Space');
    expect(b.cannon[0]).toBe('KeyF');
  });

  it('takes the key away from another action that also has other keys', () => {
    const b = rebind(DEFAULT_BINDINGS, 'cannon', 'ArrowUp');
    expect(b.cannon[0]).toBe('ArrowUp');
    expect(b.pitchDown).toEqual(['KeyW']);
  });

  it('refuses Escape, function keys and modifier keys other than Shift', () => {
    for (const code of ['Escape', 'F5', 'ControlLeft', 'MetaRight', 'AltLeft']) expect(canBind(code)).toBe(false);
    for (const code of ['KeyQ', 'ShiftRight', 'Digit3', 'Space', 'Tab']) expect(canBind(code)).toBe(true);
    expect(rebind(DEFAULT_BINDINGS, 'cannon', 'Escape')).toBe(DEFAULT_BINDINGS);
  });

  it('finds the actions a key triggers', () => {
    expect(actionsFor(DEFAULT_BINDINGS, 'KeyW')).toEqual(['pitchDown']);
    expect(actionsFor(DEFAULT_BINDINGS, 'KeyL')).toEqual([]);
  });

  it('labels keys the way the keyboard shows them', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('Space')).toBe('Space');
    expect(keysLabel(['KeyW', 'ArrowUp'])).toBe('W · ↑');
  });

  it('repairs stored bindings: unknown actions dropped, missing or invalid ones restored, duplicates removed', () => {
    const b = sanitizeBindings({ cannon: ['KeyF'], missile: ['KeyF'], bogus: ['KeyX'], pitchUp: 'nope', flares: ['Escape'] });
    expect(b.cannon).toEqual(['KeyF']);
    expect(b.missile).not.toContain('KeyF');
    expect(b.missile.length).toBeGreaterThan(0);
    expect(b.pitchUp).toEqual(DEFAULT_BINDINGS.pitchUp);
    expect(b.flares).toEqual(DEFAULT_BINDINGS.flares);
    expect('bogus' in b).toBe(false);
  });
});
