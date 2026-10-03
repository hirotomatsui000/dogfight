import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../ui/settings.ts';
import { FLIGHT_SHARE, MUSIC_URL, musicLevel } from './music.ts';

describe('soundtrack', () => {
  it('plays at master × music volume on the title screen and quieter in flight', () => {
    const s = { ...DEFAULT_SETTINGS, volume: 0.8, musicVolume: 0.5 };
    expect(musicLevel(s, 'menu')).toBeCloseTo(0.4, 9);
    expect(musicLevel(s, 'flight')).toBeCloseTo(0.4 * FLIGHT_SHARE, 9);
  });

  it('is silent with the sound or the music switched off', () => {
    expect(musicLevel({ ...DEFAULT_SETTINGS, sound: false }, 'menu')).toBe(0);
    expect(musicLevel({ ...DEFAULT_SETTINGS, music: false }, 'menu')).toBe(0);
  });

  it('keeps the music settings valid and on by default', () => {
    expect(sanitizeSettings({})).toMatchObject({ music: true, musicVolume: 0.6 });
    expect(sanitizeSettings({ music: 'yes', musicVolume: 4 })).toMatchObject({ music: true, musicVolume: 1 });
    expect(sanitizeSettings({ music: false, musicVolume: -1 })).toMatchObject({ music: false, musicVolume: 0 });
  });

  it('loads the track from beside the page, so it works in any folder', () => {
    expect(MUSIC_URL).toBe('audio/life-in-the-danger-zone.mp3');
  });
});
