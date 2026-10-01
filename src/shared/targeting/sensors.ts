import { Vector3 } from 'three';
import type { AircraftConfig, TeamId } from '../data/aircraft/types.ts';
import { AFTERBURNER_THROTTLE } from '../data/weapons.ts';
import type { Terrain } from '../map/terrain.ts';
import { DEG } from '../math/units.ts';
import type { FlightState } from '../physics/flight-model.ts';

/** What sensors and seekers need to know about an aircraft. `AircraftEntity` satisfies it. */
export interface SensedAircraft {
  readonly id: number;
  readonly team: TeamId;
  readonly alive: boolean;
  readonly flight: FlightState;
  readonly config: AircraftConfig;
}

export interface Contact {
  id: number;
  visual: boolean;
  radar: boolean;
  rangeM: number;
  /** angle between the observer's nose and the contact */
  offNoseRad: number;
}

export const VISUAL_RANGE_M = 6000;
export const VISUAL_RANGE_AFTERBURNER_M = 8000;
/** radar range = radarRange × (1 − 0.7 × target stealth) */
export const RADAR_STEALTH_EFFECT = 0.7;
export const RADAR_SCAN_INTERVAL_S = 0.2;

const nose = new Vector3();
const toTarget = new Vector3();

/** Anything besides the terrain that hides an aircraft from the eye and from infrared seekers: clouds (M4). */
export interface Obscurant {
  blocks(a: Vector3, b: Vector3): boolean;
}

/**
 * Enemies the observer can see or has on radar, with terrain masking (spec §10.3). Clouds hide aircraft from the eye
 * but not from radar. Rewrites `out`.
 */
export function detectContacts(observer: SensedAircraft, others: Iterable<SensedAircraft>, terrain: Terrain, out: Contact[], clouds: Obscurant | null = null): Contact[] {
  out.length = 0;
  const o = observer.flight;
  const sensors = observer.config.sensors;
  nose.set(0, 0, -1).applyQuaternion(o.quat);
  for (const t of others) {
    if (!t.alive || t.team === observer.team || t.id === observer.id) continue;
    toTarget.subVectors(t.flight.pos, o.pos);
    const rangeM = toTarget.length();
    const offNoseRad = rangeM > 0 ? nose.angleTo(toTarget) : 0;
    const visualRange = t.flight.throttle > AFTERBURNER_THROTTLE ? VISUAL_RANGE_AFTERBURNER_M : VISUAL_RANGE_M;
    const radarRange = sensors.radarRangeKm * 1000 * (1 - RADAR_STEALTH_EFFECT * t.config.sensors.stealth);
    let visual = rangeM <= visualRange;
    const radar = offNoseRad <= sensors.radarConeDeg * DEG && rangeM <= radarRange;
    if (!(visual || radar) || !terrain.lineOfSight(o.pos, t.flight.pos)) continue;
    if (visual && clouds && clouds.blocks(o.pos, t.flight.pos)) visual = false;
    if (visual || radar) out.push({ id: t.id, visual, radar, rangeM, offNoseRad });
  }
  return out;
}
