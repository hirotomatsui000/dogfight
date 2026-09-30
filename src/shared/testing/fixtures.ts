import { Vector3 } from 'three';
import { getAircraft } from '../data/aircraft/registry.ts';
import type { AircraftConfig, TeamId } from '../data/aircraft/types.ts';
import type { Terrain } from '../map/terrain.ts';
import { DEG } from '../math/units.ts';
import { neutralInput } from '../physics/controls.ts';
import { createFlightState } from '../physics/flight-model.ts';

/** Flat ground at 0 m with a clear line of sight everywhere (or nowhere, for `blockedTerrain`). */
export const openTerrain: Terrain = {
  sizeM: 1e6,
  heightAt: () => 0,
  surfaceAt: () => 0,
  normalAt: (_x, _z, out = new Vector3()) => out.set(0, 1, 0),
  lineOfSight: () => true,
};

export const blockedTerrain: Terrain = { ...openTerrain, lineOfSight: () => false };

export interface TestAircraft {
  id: number;
  team: TeamId;
  alive: boolean;
  config: AircraftConfig;
  flight: ReturnType<typeof createFlightState>;
  input: ReturnType<typeof neutralInput>;
}

/** A level aircraft for targeting tests. Heading 0 = north (-z), 90 = east (+x). */
export function testAircraft(id: number, aircraftId: string, x: number, y: number, z: number, headingDeg = 0, throttle = 0.8): TestAircraft {
  const config = getAircraft(aircraftId);
  return {
    id,
    team: config.team,
    alive: true,
    config,
    flight: createFlightState({ position: new Vector3(x, y, z), headingRad: headingDeg * DEG, speed: 250, throttle }),
    input: neutralInput(throttle),
  };
}
