import type { MissileSpec } from '../data/weapons.ts';
import type { FlightEnv } from '../physics/flight-model.ts';

export type DamageState = 'healthy' | 'damaged' | 'critical' | 'destroyed';

/** Spec §11: healthy ≥ 60% of hit points, damaged 30–60%, critical below 30%, destroyed at 0. */
export function damageState(hp: number, maxHp: number): DamageState {
  if (hp <= 0) return 'destroyed';
  const f = hp / maxHp;
  if (f >= 0.6) return 'healthy';
  if (f >= 0.3) return 'damaged';
  return 'critical';
}

/** Flight-model multipliers for a damage state: damaged thrust ×0.9; critical thrust ×0.75 and roll ×0.7. */
export function damageFlightEnv(state: DamageState, out: FlightEnv): FlightEnv {
  out.thrustScale = state === 'damaged' ? 0.9 : state === 'critical' ? 0.75 : 1;
  out.rollScale = state === 'critical' ? 0.7 : 1;
  return out;
}

/** Warhead damage at `distanceM` from the burst: full inside the inner radius, falling linearly to 0 at the outer. */
export function blastDamage(distanceM: number, spec: MissileSpec): number {
  if (distanceM <= spec.blastFullDamageRadiusM) return spec.blastDamage;
  if (distanceM >= spec.blastMaxRadiusM) return 0;
  return (spec.blastDamage * (spec.blastMaxRadiusM - distanceM)) / (spec.blastMaxRadiusM - spec.blastFullDamageRadiusM);
}

/** A crash within this many seconds of enemy damage or an enemy lock counts as a kill for that enemy. */
export const MANEUVER_KILL_WINDOW_S = 15;

export interface CreditRecord {
  lastDamagedBy: number | null;
  lastDamagedTick: number;
  lastLockedBy: number | null;
  lastLockedTick: number;
}

export function clearCredit(r: CreditRecord): void {
  r.lastDamagedBy = null;
  r.lastDamagedTick = -1;
  r.lastLockedBy = null;
  r.lastLockedTick = -1;
}

/** The enemy credited with a crash ("maneuver kill"), or null: the most recent damage or lock inside the window. */
export function maneuverKillCredit(r: CreditRecord, tick: number, tickRate: number): number | null {
  const window = MANEUVER_KILL_WINDOW_S * tickRate;
  const damaged = r.lastDamagedBy !== null && tick - r.lastDamagedTick <= window;
  const locked = r.lastLockedBy !== null && tick - r.lastLockedTick <= window;
  if (damaged && locked) return r.lastDamagedTick >= r.lastLockedTick ? r.lastDamagedBy : r.lastLockedBy;
  if (damaged) return r.lastDamagedBy;
  if (locked) return r.lastLockedBy;
  return null;
}
