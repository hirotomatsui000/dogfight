import { Quaternion, Vector3 } from 'three';
import type { FlightState } from '../physics/flight-model.ts';
import type { Missile } from '../weapons/missile.ts';

export interface MissileWarning {
  missileId: number;
  rangeM: number;
  /** direction to the missile, clockwise from the nose in the aircraft's own frame (+ = right) */
  bearingRad: number;
  /** how fast the range shrinks, m/s (negative while the missile falls behind) */
  closureMs: number;
  /** seconds until the missile arrives at the current closure; Infinity when it is not closing */
  timeToImpactS: number;
}

const rel = new Vector3();
const relVel = new Vector3();
const qInv = new Quaternion();

/**
 * The missile guiding on `self` that will arrive first (spec §10.3). Warnings start at launch, so the pilot can watch
 * it come and time a hard break. Missiles that are not closing rank after the closing ones, nearest first.
 */
export function incomingMissileWarning(self: { id: number; flight: FlightState }, missiles: Iterable<Missile>): MissileWarning | null {
  let best: MissileWarning | null = null;
  for (const m of missiles) {
    if (m.targetId !== self.id) continue;
    rel.subVectors(m.pos, self.flight.pos);
    const range = rel.length();
    relVel.subVectors(self.flight.vel, m.vel);
    const closure = range > 1e-6 ? relVel.dot(rel) / range : 0;
    const time = closure > 1 ? range / closure : Infinity;
    if (best && (time > best.timeToImpactS || (time === best.timeToImpactS && range >= best.rangeM))) continue;
    rel.applyQuaternion(qInv.copy(self.flight.quat).invert());
    best = { missileId: m.id, rangeM: range, bearingRad: Math.atan2(rel.x, -rel.z), closureMs: closure, timeToImpactS: time };
  }
  return best;
}
