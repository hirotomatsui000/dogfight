import type { UnitSystem } from '../../shared/data/aircraft/types.ts';
import { M_TO_FT, MS_TO_KMH, MS_TO_KT, RAD } from '../../shared/math/units.ts';

export const speedValue = (ms: number, units: UnitSystem) => (units === 'imperial' ? ms * MS_TO_KT : ms * MS_TO_KMH);
export const speedLabel = (units: UnitSystem) => (units === 'imperial' ? 'KT' : 'KM/H');
export const altitudeValue = (m: number, units: UnitSystem) => (units === 'imperial' ? m * M_TO_FT : m);
export const altitudeLabel = (units: UnitSystem) => (units === 'imperial' ? 'FT' : 'M');
/** ft/min (imperial) or m/s (metric) */
export const verticalSpeedValue = (ms: number, units: UnitSystem) => (units === 'imperial' ? ms * M_TO_FT * 60 : ms);
export const verticalSpeedLabel = (units: UnitSystem) => (units === 'imperial' ? 'FT/MIN' : 'M/S');

export function headingDegrees(rad: number): number {
  const d = Math.round(rad * RAD) % 360;
  return d < 0 ? d + 360 : d;
}

export function headingLabel(deg: number): string {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  if (d === 0) return 'N';
  if (d === 90) return 'E';
  if (d === 180) return 'S';
  if (d === 270) return 'W';
  return String(d).padStart(3, '0');
}

export const formatMach = (mach: number) => `M ${mach.toFixed(2)}`;

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Nautical miles (imperial) or kilometers (metric). */
export const rangeValue = (m: number, units: UnitSystem) => (units === 'imperial' ? m / 1852 : m / 1000);
export const rangeLabel = (units: UnitSystem) => (units === 'imperial' ? 'NM' : 'KM');

export function formatRange(m: number, units: UnitSystem): string {
  const v = rangeValue(m, units);
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${rangeLabel(units)}`;
}

/** Closing speed with a sign: + closing, − opening. */
export function formatClosure(ms: number, units: UnitSystem): string {
  const v = Math.round(speedValue(ms, units));
  return `${v >= 0 ? '+' : ''}${v} ${speedLabel(units)}`;
}
