import { Euler, Quaternion, Vector3 } from 'three';
import type { MissileSpec } from '../data/weapons.ts';
import { AFTERBURNER_THROTTLE } from '../data/weapons.ts';
import type { Terrain } from '../map/terrain.ts';
import { DEG } from '../math/units.ts';
import type { ControlInput } from '../physics/controls.ts';
import type { Obscurant, SensedAircraft } from './sensors.ts';

export type SeekerMode = 'off' | 'search' | 'track' | 'locked';

/** Infrared seeker of the selected short-range missile: SEARCH → TRACK (growl) → LOCKED (tone), spec §10.3. */
export interface SeekerState {
  mode: SeekerMode;
  targetId: number | null;
  lockTimerS: number;
  /** world direction the seeker is looking */
  readonly axis: Vector3;
}

export interface SeekerOwner extends SensedAircraft {
  readonly input: Pick<ControlInput, 'helmetSight' | 'lookYaw' | 'lookPitch'>;
}

export function createSeeker(): SeekerState {
  return { mode: 'off', targetId: null, lockTimerS: 0, axis: new Vector3(0, 0, -1) };
}

export function resetSeeker(s: SeekerState, mode: 'off' | 'search'): void {
  s.mode = mode;
  s.targetId = null;
  s.lockTimerS = 0;
}

const nose = new Vector3();
const toTarget = new Vector3();
const targetNose = new Vector3();
const headQ = new Quaternion();
const headE = new Euler(0, 0, 0, 'YXZ');

/** Lock range against `target` seen from `fromPos`: longer from behind, shorter head-on (spec §10.2). */
export function irLockRange(spec: MissileSpec, fromPos: Vector3, target: SensedAircraft): number {
  const f = target.flight;
  targetNose.set(0, 0, -1).applyQuaternion(f.quat);
  toTarget.subVectors(fromPos, f.pos);
  const len = toTarget.length();
  // 1 when the shooter is straight behind the target, 0 when straight ahead of it.
  const tailness = len > 0 ? (1 - targetNose.dot(toTarget) / len) / 2 : 1;
  let range = spec.lockRangeHeadOnM + (spec.lockRangeTailM - spec.lockRangeHeadOnM) * tailness;
  if (f.throttle > AFTERBURNER_THROTTLE) range *= spec.afterburnerRangeFactor;
  return range * target.config.sensors.irSignature;
}

export function offBoresightLimitRad(spec: MissileSpec, owner: SensedAircraft): number {
  return (owner.config.sensors.helmetSight ? spec.offBoresightHelmetDeg : spec.offBoresightDeg) * DEG;
}

export function lockTimeS(spec: MissileSpec, owner: SensedAircraft): number {
  return spec.lockTimeS * (owner.config.sensors.helmetSight ? spec.helmetLockTimeFactor : 1);
}

function findTarget(id: number, enemies: Iterable<SensedAircraft>): SensedAircraft | null {
  for (const t of enemies) if (t.id === id) return t;
  return null;
}

/**
 * Advances the seeker one tick. It looks toward the designated target when that is inside the off-boresight limit,
 * otherwise along the helmet-sight direction (aircraft with a helmet sight, while looking around) or the nose.
 */
export function updateSeeker(
  s: SeekerState,
  owner: SeekerOwner,
  enemies: Iterable<SensedAircraft>,
  designated: SensedAircraft | null,
  spec: MissileSpec,
  terrain: Terrain,
  dt: number,
  clouds: Obscurant | null = null,
): void {
  const pos = owner.flight.pos;
  const limit = offBoresightLimitRad(spec, owner);
  nose.set(0, 0, -1).applyQuaternion(owner.flight.quat);
  const angleFromNose = (t: SensedAircraft) => nose.angleTo(toTarget.subVectors(t.flight.pos, pos));

  const designatedInLimit = designated !== null && designated.alive && angleFromNose(designated) <= limit;
  if (designatedInLimit && designated) {
    s.axis.subVectors(designated.flight.pos, pos).normalize();
  } else if (owner.config.sensors.helmetSight && owner.input.helmetSight) {
    headE.set(owner.input.lookPitch, -owner.input.lookYaw, 0, 'YXZ');
    s.axis.set(0, 0, -1).applyQuaternion(headQ.setFromEuler(headE)).applyQuaternion(owner.flight.quat);
  } else {
    s.axis.copy(nose);
  }

  if ((s.mode === 'track' || s.mode === 'locked') && s.targetId !== null) {
    const t = findTarget(s.targetId, enemies);
    const switching = designatedInLimit && designated !== null && designated.id !== s.targetId;
    let keep = t !== null && t.alive && !switching && angleFromNose(t) <= limit;
    if (keep && t) {
      const range = pos.distanceTo(t.flight.pos);
      const maxRange = irLockRange(spec, pos, t) * (s.mode === 'locked' ? spec.lockKeepRangeFactor : 1);
      keep = range <= maxRange && terrain.lineOfSight(pos, t.flight.pos) && !clouds?.blocks(pos, t.flight.pos);
      if (keep && s.mode === 'track') keep = s.axis.angleTo(toTarget.subVectors(t.flight.pos, pos)) <= spec.acquisitionConeDeg * DEG;
    }
    if (keep && t) {
      if (s.mode === 'track') {
        s.lockTimerS += dt;
        if (s.lockTimerS >= lockTimeS(spec, owner) - 1e-9) s.mode = 'locked';
      }
      if (s.mode === 'locked') s.axis.subVectors(t.flight.pos, pos).normalize();
      return;
    }
    resetSeeker(s, 'search');
  }

  s.mode = 'search';
  let best: SensedAircraft | null = null;
  let bestAngle = Infinity;
  for (const t of enemies) {
    if (!t.alive || t.team === owner.team) continue;
    toTarget.subVectors(t.flight.pos, pos);
    const a = s.axis.angleTo(toTarget);
    if (a > spec.acquisitionConeDeg * DEG || a >= bestAngle) continue;
    if (nose.angleTo(toTarget) > limit) continue;
    if (toTarget.length() > irLockRange(spec, pos, t)) continue;
    if (!terrain.lineOfSight(pos, t.flight.pos) || clouds?.blocks(pos, t.flight.pos)) continue;
    best = t;
    bestAngle = a;
  }
  if (best) {
    s.mode = 'track';
    s.targetId = best.id;
    s.lockTimerS = 0;
  }
}
