import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSetting, saveSetting } from './storage.ts';

describe('settings storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips JSON values through localStorage', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
    saveSetting('callsign', 'Viper');
    expect(loadSetting('callsign', 'Pilot')).toBe('Viper');
    expect(loadSetting('missing', 42)).toBe(42);
  });
  it('falls back when storage throws or is missing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => saveSetting('x', 1)).not.toThrow();
    expect(loadSetting('x', 'fallback')).toBe('fallback');
    vi.stubGlobal('localStorage', undefined);
    expect(loadSetting('x', 'fallback')).toBe('fallback');
  });
  it('falls back on corrupt JSON', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{nope', setItem: () => undefined });
    expect(loadSetting('x', 7)).toBe(7);
  });
});
