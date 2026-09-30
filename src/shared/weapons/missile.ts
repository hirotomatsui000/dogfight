import { Vector3 } from 'three';
import type { TeamId } from '../data/aircraft/types.ts';
import type { MissileSpec } from '../data/weapons.ts';
import { DEG, G0 } from '../math/units.ts';
import type { FlightState } from '../physics/flight-model.ts';

export interface Missile {
  id: number;
  spec: MissileSpec;
  ownerId: number;
  team: TeamId;
  /** null once the missile has lost its target; it then flies ballistic */
  targetId: number | null;
  pos: Vector3;
  prevPos: Vector3;
  vel: Vector3;
  ageS: number;
  /** turning acceleration of the last step, m/s² */
  lateralAccel: number;
}

export interface MissileLauncher {
  id: number;
  team: TeamId;
  flight: FlightState;
}

export interface GuidanceTarget {
  pos: Vector3;
  vel: Vector3;
}

/** Leaves along the launcher's nose at the launcher's speed. */
export function launchMissile(id: number, launcher: MissileLauncher, targetId: number, spec: MissileSpec): Missile {
  const f = launcher.flight;
  const vel = new Vector3(0, 0, -1).applyQuaternion(f.quat).multiplyScalar(f.vel.length());
  return {
    id,
    spec,
    ownerId: launcher.id,
    team: launcher.team,
    targetId,
    pos: f.pos.clone(),
    prevPos: f.pos.clone(),
    vel,
    ageS: 0,
    lateralAccel: 0,
  };
}

const r = new Vector3();
const vr = new Vector3();
const losRate = new Vector3();
const acc = new Vector3();
const vHat = new Vector3();

/**
 * One step of guidance and flight. Guidance is pure proportional navigation (a = N·Ω×V) with gravity
 * compensation, perpendicular to the flight path and limited to maxAccelG. Motor thrust, air drag and turning
 * drag act along the flight path.
 */
export function stepMissile(m: Missile, target: GuidanceTarget | null, density: number, dt: number): void {
  const s = m.spec;
  const speed = Math.max(m.vel.length(), 1);
  vHat.copy(m.vel).divideScalar(speed);
  acc.set(0, 0, 0);
  if (target) {
    r.subVectors(target.pos, m.pos);
    vr.subVectors(target.vel, m.vel);
    losRate.crossVectors(r, vr).divideScalar(Math.max(r.lengthSq(), 1));
    acc.crossVectors(losRate, m.vel).multiplyScalar(s.navigationConstant);
    acc.y += G0;
    acc.addScaledVector(vHat, -acc.dot(vHat));
    const max = s.maxAccelG * G0;
    const len = acc.length();
    if (len > max) acc.multiplyScalar(max / len);
  }
  m.lateralAccel = acc.length();
  const thrust = m.ageS < s.burnTimeS ? s.motorAccelMs2 : 0;
  const drag = s.dragCoef * density * speed * speed + s.maneuverDragFactor * m.lateralAccel;
  acc.addScaledVector(vHat, thrust - drag);
  acc.y -= G0;
  m.prevPos.copy(m.pos);
  m.vel.addScaledVector(acc, dt);
  m.pos.addScaledVector(m.vel, dt);
  m.ageS += dt;
}

/** The seeker only sees targets within its gimbal limit around the direction of flight. */
export function withinGimbal(m: Missile, targetPos: Vector3): boolean {
  r.subVectors(targetPos, m.pos);
  return r.angleTo(m.vel) <= m.spec.gimbalLimitDeg * DEG;
}

export function isArmed(m: Missile): boolean {
  return m.ageS >= m.spec.armTimeS;
}

/** Out of time, or burnt out and too slow to be dangerous. */
export function isSpent(m: Missile): boolean {
  const s = m.spec;
  return m.ageS >= s.maxFlightTimeS || (m.ageS > s.burnTimeS && m.vel.length() < s.selfDestructSpeedMs);
}
