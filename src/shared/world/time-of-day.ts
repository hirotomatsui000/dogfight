import type { Vector3 } from 'three';
import { DEG } from '../math/units.ts';
import type { WeatherId } from './weather.ts';

/** Lechovia lies at about 52° N; the sun follows the equinox path (spec §12.3). */
export const LATITUDE_RAD = 52 * DEG;
/** The default clock: one game hour per real minute (spec §12.3). */
export const CLOCK_HOURS_PER_S = 1 / 60;

export type TimeOfDayId = 'dawn' | 'day' | 'dusk' | 'night';
export const TIME_OF_DAY_IDS: readonly TimeOfDayId[] = ['dawn', 'day', 'dusk', 'night'];
export const START_HOURS: Readonly<Record<TimeOfDayId, number>> = { dawn: 6.5, day: 12, dusk: 17.5, night: 23 };
export const TIME_OF_DAY_LABELS: Readonly<Record<TimeOfDayId, string>> = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };

export function isTimeOfDayId(v: unknown): v is TimeOfDayId {
  return TIME_OF_DAY_IDS.some((t) => t === v);
}

/** The local hour (0 … 24) after `elapsedS` seconds of a match. */
export function hourAt(startHour: number, clockRunning: boolean, elapsedS: number): number {
  const h = startHour + (clockRunning ? elapsedS * CLOCK_HOURS_PER_S : 0);
  return ((h % 24) + 24) % 24;
}

/**
 * Unit vector toward the sun at a local solar hour, in the world frame (x east, y up, z south). At the equinox it
 * rises due east at 06:00, stands due south at noon at 90° − latitude, and sets due west at 18:00.
 */
export function sunDirection(hour: number, out: Vector3): Vector3 {
  const h = ((hour - 12) / 24) * 2 * Math.PI;
  // Equator-plane coordinates of the sun's circle (declination 0), then tilted by the latitude.
  const east = -Math.sin(h);
  const southOnEquator = Math.cos(h);
  const up = southOnEquator * Math.cos(LATITUDE_RAD);
  const south = southOnEquator * Math.sin(LATITUDE_RAD);
  return out.set(east, up, south).normalize();
}

/** A full moon: opposite the sun. */
export function moonDirection(hour: number, out: Vector3): Vector3 {
  return sunDirection(hour + 12, out);
}

/** 0 at night … 1 in daylight, fading through civil twilight (sun 6° below to 6° above the horizon). */
export function daylight(sunElevationRad: number): number {
  const t = Math.min(1, Math.max(0, (sunElevationRad + 6 * DEG) / (12 * DEG)));
  return t * t * (3 - 2 * t);
}

/** Weather and clock of a match: a room setting online, the title screen's choice offline (spec §12.3). */
export interface EnvironmentSettings {
  weather: WeatherId;
  startHour: number;
  clockRunning: boolean;
}

/** A plain noon sky with no clouds: the World's default, so tests and the balance tournament stay as they were. */
export const CALM_NOON: Readonly<EnvironmentSettings> = { weather: 'clear', startHour: 12, clockRunning: false };
