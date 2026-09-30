import { Quaternion, Vector3 } from 'three';
import type { FlightState } from '../physics/flight-model.ts';
import type { Missile } from '../weapons/missile.ts';

/** A short-range missile guiding on you triggers the warning inside this range (spec §10.3). */
export const MISSILE_WARNING_RANGE_M = 3000;

export interface MissileWarning {
  missileId: number;
  rangeM: number;
  /** direction to the missile, clockwise from the nose in the aircraft's own frame (+ = right) */
  bearingRad: number;
}

const rel = new Vector3();
const qInv = new Quaternion();

/** The nearest missile guiding on `self` within warning range, or null. */
export function incomingMissileWarning(self: { id: number; flight: FlightState }, missiles: Iterable<Missile>): MissileWarning | null {
  let nearest: Missile | null = null;
  let nearestRange = MISSILE_WARNING_RANGE_M;
  for (const m of missiles) {
    if (m.targetId !== self.id) continue;
    const range = m.pos.distanceTo(self.flight.pos);
    if (range <= nearestRange) {
      nearest = m;
      nearestRange = range;
    }
  }
  if (!nearest) return null;
  rel.subVectors(nearest.pos, self.flight.pos).applyQuaternion(qInv.copy(self.flight.quat).invert());
  return { missileId: nearest.id, rangeM: nearestRange, bearingRad: Math.atan2(rel.x, -rel.z) };
}
