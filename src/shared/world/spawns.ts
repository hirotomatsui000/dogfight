import { Vector3 } from 'three';
import type { AircraftPhysics, TeamId } from '../data/aircraft/types.ts';
import type { MapDefinition } from '../data/maps/map-definition.ts';
import type { Terrain } from '../map/terrain.ts';
import { trimAlpha } from '../physics/aero.ts';
import { atmosphere } from '../physics/atmosphere.ts';
import { createFlightState, type FlightState } from '../physics/flight-model.ts';

export const SPAWN_SPEED = 250;
export const SPAWN_SLOT_SPACING = 600;
const MIN_SPAWN_CLEARANCE = 1500;

/**
 * Airborne spawn on the team's spawn line, trimmed for 1 G level flight.
 * Slots alternate right/left of the line center.
 */
export function spawnFlightState(
  map: MapDefinition,
  terrain: Terrain,
  team: TeamId,
  slot: number,
  physics: AircraftPhysics,
): FlightState {
  const spec = map.spawns[team];
  const side = slot === 0 ? 0 : (slot % 2 === 1 ? 1 : -1) * Math.ceil(slot / 2);
  const offset = side * SPAWN_SLOT_SPACING;
  const x = spec.x + Math.cos(spec.headingRad) * offset;
  const z = spec.z + Math.sin(spec.headingRad) * offset;
  const altitude = Math.max(spec.altitudeM, terrain.surfaceAt(x, z) + MIN_SPAWN_CLEARANCE);
  const alphaRad = trimAlpha(physics, SPAWN_SPEED, atmosphere(altitude).density);
  return createFlightState({
    position: new Vector3(x, altitude, z),
    headingRad: spec.headingRad,
    speed: SPAWN_SPEED,
    throttle: 0.8,
    alphaRad,
  });
}
