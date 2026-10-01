import type { AircraftConfig } from '../data/aircraft/types.ts';
import type { MissileSpec } from '../data/weapons.ts';
import type { Contact } from './sensors.ts';

export type RadarLockMode = 'off' | 'search' | 'tracking' | 'locked';

/**
 * Radar lock for the medium-range missile (spec §10.3): off unless the MRM is selected, then searching until the
 * designated target is an own-radar contact inside the cone, tracking while the lock builds, locked when it has.
 */
export interface RadarLockState {
  mode: RadarLockMode;
  targetId: number | null;
  timerS: number;
}

export function createRadarLock(): RadarLockState {
  return { mode: 'off', targetId: null, timerS: 0 };
}

export function resetRadarLock(s: RadarLockState, mode: 'off' | 'search'): void {
  s.mode = mode;
  s.targetId = null;
  s.timerS = 0;
}

/** 1.5 s, × 0.7 with two seats, × 0.8 with sensor fusion. */
export function radarLockTimeS(spec: MissileSpec, config: AircraftConfig): number {
  const s = config.sensors;
  return spec.lockTimeS * (s.twoSeat ? spec.twoSeatLockTimeFactor : 1) * (s.sensorFusion ? spec.sensorFusionLockTimeFactor : 1);
}

/** 0 while searching, rising to 1 at lock. */
export function radarLockProgress(s: RadarLockState, spec: MissileSpec, config: AircraftConfig): number {
  if (s.mode === 'locked') return 1;
  if (s.mode !== 'tracking') return 0;
  return Math.min(1, s.timerS / radarLockTimeS(spec, config));
}

/** Advances the lock one tick. `armed` is true while the MRM is selected and one is left. */
export function updateRadarLock(
  s: RadarLockState,
  config: AircraftConfig,
  armed: boolean,
  designatedId: number | null,
  contacts: readonly Contact[],
  spec: MissileSpec,
  dt: number,
): void {
  if (!armed) {
    if (s.mode !== 'off') resetRadarLock(s, 'off');
    return;
  }
  const onRadar = designatedId !== null && contacts.some((c) => c.id === designatedId && c.radar);
  if (!onRadar) {
    if (s.mode !== 'search' || s.targetId !== null) resetRadarLock(s, 'search');
    return;
  }
  if (s.targetId !== designatedId || s.mode === 'off' || s.mode === 'search') {
    s.mode = 'tracking';
    s.targetId = designatedId;
    s.timerS = 0;
  }
  if (s.mode === 'tracking') {
    s.timerS += dt;
    if (s.timerS >= radarLockTimeS(spec, config) - 1e-9) s.mode = 'locked';
  }
}
