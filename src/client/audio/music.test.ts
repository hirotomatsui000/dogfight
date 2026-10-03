import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings, SettingsStore } from '../ui/settings.ts';
import { FLIGHT_SHARE, MUSIC_URL, musicLevel, MusicPlayer } from './music.ts';

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

/** An audio element like iOS Safari's: scripts cannot change its volume, it always reads 1. */
class FakeAudio {
  loop = false;
  preload = '';
  paused = true;
  plays = 0;
  pauses = 0;
  static last: FakeAudio | null = null;
  constructor() {
    FakeAudio.last = this;
  }
  get volume(): number {
    return 1;
  }
  set volume(_v: number) {}
  play(): Promise<void> {
    this.paused = false;
    this.plays++;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
    this.pauses++;
  }
}

describe('MusicPlayer', () => {
  let listeners: Map<string, Set<() => void>>;
  let doc: { hidden: boolean; addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void };
  const fire = (type: string) => {
    for (const f of [...(listeners.get(type) ?? [])]) f();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = new Map();
    doc = {
      hidden: false,
      addEventListener: (t, f) => listeners.set(t, (listeners.get(t) ?? new Set()).add(f)),
      removeEventListener: (t, f) => listeners.get(t)?.delete(f),
    };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const start = () => {
    const settings = new SettingsStore({ ...DEFAULT_SETTINGS }, false);
    const player = new MusicPlayer(settings, 'x.mp3');
    const audio = FakeAudio.last as FakeAudio;
    fire('pointerdown');
    vi.advanceTimersByTime(2000);
    return { settings, player, audio };
  };

  it('starts on the first click and pauses when the music is switched off, even where scripts cannot set the volume', () => {
    const { settings, audio } = start();
    expect(audio.paused).toBe(false);
    settings.update({ music: false });
    vi.advanceTimersByTime(2000);
    expect(audio.paused).toBe(true);
    settings.update({ music: true });
    vi.advanceTimersByTime(2000);
    expect(audio.paused).toBe(false);
  });

  it('pauses at once when the tab is hidden (timers crawl there) and plays again when it is back', () => {
    const { audio } = start();
    doc.hidden = true;
    fire('visibilitychange');
    expect(audio.paused).toBe(true);
    doc.hidden = false;
    fire('visibilitychange');
    expect(audio.paused).toBe(false);
  });

  it('stops its fade timer once a fade is done', () => {
    const { player } = start();
    player.setScene('flight');
    vi.advanceTimersByTime(2000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
