import type { FlightState } from '../physics/flight-model.ts';
import type { Terrain } from './terrain.ts';

/**
 * Seconds until the straight-line flight path comes within `marginM` of the surface, or null if not within
 * `horizonS`. Used by the PULL UP warning and by bots' ground avoidance.
 */
export function timeToImpact(flight: FlightState, terrain: Terrain, horizonS = 5, stepS = 0.25, marginM = 30): number | null {
  const p = flight.pos;
  const v = flight.vel;
  for (let t = stepS; t <= horizonS + 1e-9; t += stepS) {
    const x = p.x + v.x * t;
    const z = p.z + v.z * t;
    if (p.y + v.y * t < terrain.surfaceAt(x, z) + marginM) return t;
  }
  return null;
}
