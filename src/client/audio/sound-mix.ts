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
