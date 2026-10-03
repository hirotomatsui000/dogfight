import type { Settings, SettingsStore } from '../ui/settings.ts';

/** The soundtrack: "Life in the Danger Zone" by DJARTMUSIC (Pixabay), looped (CREDITS.md). Relative to the page. */
export const MUSIC_URL = 'audio/life-in-the-danger-zone.mp3';

/** Where the player is: the title screen plays the music out, flight keeps it under the engines and warnings. */
export type MusicScene = 'menu' | 'flight';
export const FLIGHT_SHARE = 0.4;
const FADE_S = 0.8;

/** How loud the music plays, 0..1, for the settings and the scene. */
export function musicLevel(s: Pick<Settings, 'sound' | 'volume' | 'music' | 'musicVolume'>, scene: MusicScene): number {
  if (!s.sound || !s.music) return 0;
  return s.volume * s.musicVolume * (scene === 'flight' ? FLIGHT_SHARE : 1);
}

/**
 * Plays the soundtrack on a loop from the first click or key press (browsers block sound before one), fading between
 * the title screen's level and the quieter level in flight, following the Sound settings, and pausing while the tab is
 * hidden.
 */
export class MusicPlayer {
  private readonly settings: SettingsStore;
  private readonly audio: HTMLAudioElement;
  private scene: MusicScene = 'menu';
  private unlocked = false;
  /**
   * The volume as faded so far. Kept here rather than read back from the element: iOS ignores scripted volume, so a
   * fade that waited for `audio.volume` to arrive would never end, and switching the music off would never pause it.
   */
  private level = 0;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(settings: SettingsStore, url = MUSIC_URL) {
    this.settings = settings;
    this.audio = new Audio(url);
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.audio.volume = 0;
    const unlock = () => {
      this.unlocked = true;
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      this.apply();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', () => this.apply());
    settings.subscribe(() => this.apply());
  }

  setScene(scene: MusicScene): void {
    this.scene = scene;
    this.apply();
  }

  private apply(): void {
    if (document.hidden) {
      // Timers crawl in a background tab, so a fade would keep the music playing there for many seconds: stop now.
      this.stopFade();
      this.setLevel(0);
      this.audio.pause();
      return;
    }
    const target = musicLevel(this.settings.current, this.scene);
    if (!this.unlocked || target <= 0) {
      this.fadeTo(0, () => this.audio.pause());
      return;
    }
    if (this.audio.paused) this.audio.play().catch(() => undefined);
    this.fadeTo(target);
  }

  private setLevel(v: number): void {
    this.level = Math.min(1, Math.max(0, v));
    this.audio.volume = this.level;
  }

  private stopFade(): void {
    if (this.fadeTimer !== null) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
  }

  /** Moves the volume to `target` over FADE_S, then calls `done`. */
  private fadeTo(target: number, done?: () => void): void {
    this.stopFade();
    const stepS = 0.05;
    const step = Math.max(0.01, (Math.abs(target - this.level) * stepS) / FADE_S);
    const tick = () => {
      const v = this.level;
      this.setLevel(Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step);
      if (this.level !== target) return false;
      this.stopFade();
      done?.();
      return true;
    };
    if (!tick()) this.fadeTimer = setInterval(tick, stepS * 1000);
  }
}
