import { AFTERBURNER_THROTTLE } from '../../shared/data/weapons.ts';
import { clamp } from '../../shared/math/units.ts';
import type { SeekerMode } from '../../shared/targeting/ir-seeker.ts';
import type { RadarLockMode } from '../../shared/targeting/radar-lock.ts';

export interface EngineMix {
  engineHz: number;
  engineGain: number;
  afterburnerGain: number;
  windHz: number;
  windGain: number;
}

const SILENT: EngineMix = { engineHz: 55, engineGain: 0, afterburnerGain: 0, windHz: 300, windGain: 0 };

/** Engine, afterburner and wind loudness from the throttle and airspeed. */
export function engineMix(throttle: number, airspeedMs: number, alive: boolean): EngineMix {
  if (!alive) return SILENT;
  const t = clamp(throttle, 0, 1);
  const military = Math.min(t / AFTERBURNER_THROTTLE, 1);
  const ab = t > AFTERBURNER_THROTTLE ? (t - AFTERBURNER_THROTTLE) / (1 - AFTERBURNER_THROTTLE) : 0;
  return {
    engineHz: 55 + 70 * military,
    engineGain: 0.08 + 0.12 * military,
    afterburnerGain: 0.25 * ab,
    windHz: 300 + 4 * airspeedMs,
    windGain: 0.02 + 0.18 * clamp(airspeedMs / 400, 0, 1),
  };
}

export type SeekerTone = 'none' | 'growl' | 'lock' | 'radar-track' | 'radar-lock';

/** Missile seeker audio: a growl while tracking, a steady tone when locked (spec §15.5). */
export function seekerTone(mode: SeekerMode): SeekerTone {
  if (mode === 'track') return 'growl';
  if (mode === 'locked') return 'lock';
  return 'none';
}

/**
 * The selected missile's tone: the Dart's seeker, or for the Lance (radar lock on, M3) quick beeps while the lock
 * builds and a steady tone once it holds.
 */
export function missileTone(seeker: SeekerMode, radar: RadarLockMode): SeekerTone {
  if (radar === 'tracking') return 'radar-track';
  if (radar === 'locked') return 'radar-lock';
  return seekerTone(seeker);
}

/** Loudness of an explosion heard from `distanceM` away. */
export function explosionGain(distanceM: number): number {
  const k = clamp(1 - distanceM / 6000, 0, 1);
  return k * k;
}

/** On/off pattern for warning beeps. */
export function beepOn(timeS: number, rateHz: number, duty = 0.5): boolean {
  return (timeS * rateHz) % 1 < duty;
}

/** Speed of sound for the Doppler shift of other jets, m/s. */
const SOUND_SPEED_MS = 340;

/**
 * Pitch factor of a moving source heard by a moving listener (M5): above 1 while it approaches, below 1 after it
 * passes. `rel` is the source position minus the listener's; clamped so a supersonic pass does not scream.
 */
export function dopplerFactor(rel: { x: number; y: number; z: number }, sourceVel: { x: number; y: number; z: number }, listenerVel: { x: number; y: number; z: number }): number {
  const d = Math.hypot(rel.x, rel.y, rel.z);
  if (d < 1) return 1;
  // Speeds along the line from the listener to the source (+ = away from the listener).
  const vs = (sourceVel.x * rel.x + sourceVel.y * rel.y + sourceVel.z * rel.z) / d;
  const vl = (listenerVel.x * rel.x + listenerVel.y * rel.y + listenerVel.z * rel.z) / d;
  return clamp((SOUND_SPEED_MS + vl) / Math.max(SOUND_SPEED_MS + vs, 60), 0.5, 2);
}

/** Loudness of another jet heard from `distanceM` away: full close by, gone past 2.5 km. */
export function flybyGain(distanceM: number, throttle: number): number {
  const k = clamp(1 - distanceM / 2500, 0, 1);
  return k * k * (0.35 + 0.65 * clamp(throttle, 0, 1));
}

export interface SoundSource {
  id: number;
  pos: { x: number; y: number; z: number };
}

/** The `n` sources nearest the listener within `maxM`, nearest first. */
export function nearestSources<T extends SoundSource>(sources: Iterable<T>, listener: { x: number; y: number; z: number }, n: number, maxM: number): T[] {
  const near: [number, T][] = [];
  for (const s of sources) {
    const d = Math.hypot(s.pos.x - listener.x, s.pos.y - listener.y, s.pos.z - listener.z);
    if (d <= maxM) near.push([d, s]);
  }
  return near
    .sort((a, b) => a[0] - b[0])
    .slice(0, n)
    .map(([, s]) => s);
}
