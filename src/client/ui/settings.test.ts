import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BINDINGS } from '../input/bindings.ts';
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, SettingsStore } from './settings.ts';

/** A Map-backed localStorage for the node test environment. */
function fakeStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('settings', () => {
  it('fills every field with a default', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps numbers and rejects unknown choices', () => {
    const s = sanitizeSettings({ volume: 7, mouseSensitivity: -1, hudScale: 'big', hudColor: 'pink', graphics: 'ultra', controlMode: 'direct' });
    expect(s.volume).toBe(1);
    expect(s.mouseSensitivity).toBe(0.25);
    expect(s.hudScale).toBe(1);
    expect(s.hudColor).toBe('green');
    expect(s.graphics).toBe('auto');
    expect(s.controlMode).toBe('direct');
  });

  it('repairs gamepad assignments and calibration', () => {
    const s = sanitizeSettings({ gamepad: { custom: { axes: { roll: 5, pitch: 'x' }, buttons: { cannon: 3, missile: 999 } }, calibration: [{ center: 0.2, min: 0.5, max: 2 }, 'bad'] } });
    expect(s.gamepad.custom.axes.roll).toBe(5);
    expect(s.gamepad.custom.axes.pitch).toBe(1);
    expect(s.gamepad.custom.buttons.cannon).toBe(3);
    expect(s.gamepad.custom.buttons.missile).toBe(1);
    expect(s.gamepad.calibration[0]).toEqual({ center: 0.2, min: 0.2, max: 1 });
    expect(s.gamepad.calibration[1]).toEqual({ center: 0, min: -1, max: 1 });
  });

  it('migrates the sound, camera-shake and steering settings of earlier versions', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'contested-skies:sound': 'false', 'contested-skies:reduceMotion': 'true', 'contested-skies:controlMode': '"direct"' }));
    const s = loadSettings();
    expect(s.sound).toBe(false);
    expect(s.reduceMotion).toBe(true);
    expect(s.controlMode).toBe('direct');
  });

  it('saves, validates and announces every change', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const store = new SettingsStore(DEFAULT_SETTINGS);
    const seen: number[] = [];
    const off = store.subscribe((s) => seen.push(s.volume));
    store.update({ volume: 0.3 });
    store.update({ volume: 5 });
    off();
    store.update({ volume: 0.5 });
    expect(seen).toEqual([0.3, 1]);
    expect(JSON.parse(storage.map.get('contested-skies:settings') ?? '{}').volume).toBe(0.5);
    expect(new SettingsStore().current.volume).toBe(0.5);
    expect(store.current.keys).toEqual(DEFAULT_BINDINGS);
  });
});
