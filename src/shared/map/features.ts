import type { TeamId } from '../data/aircraft/types.ts';

/** A city or village (spec §12.3). Positions in metres, map frame (x east, z south). */
export interface Settlement {
  name: string;
  kind: 'city' | 'village';
  x: number;
  z: number;
  radiusM: number;
  capital?: boolean;
}

/** A road as a polyline of x, z pairs (flat array, metres). */
export interface Road {
  kind: 'highway' | 'local';
  points: number[];
}

export interface River {
  name: string;
  /** source to mouth, x, z pairs (flat array, metres) */
  points: number[];
}

/**
 * A military airfield: one runway, with taxiway, apron, hangars and a tower beside it. `headingRad` is the take-off
 * direction from the threshold where jets start (0 = north, PI/2 = east).
 */
export interface Airfield {
  id: string;
  name: string;
  /** the team that starts here, or null for a neutral field */
  team: TeamId | null;
  x: number;
  z: number;
  headingRad: number;
  lengthM: number;
  widthM: number;
  elevationM: number;
}

export interface MapFeatures {
  settlements: Settlement[];
  roads: Road[];
  rivers: River[];
  airfields: Airfield[];
}

/** The flattened ground around a runway where wheels may touch (spec §8, M4): half-length beyond the ends, half-width. */
export const AIRFIELD_GROUND_OVERRUN_M = 400;
export const AIRFIELD_GROUND_HALF_WIDTH_M = 450;
/** Where the taxiway, apron, hangars and tower sit, to the right of the take-off direction. */
export const AIRFIELD_APRON_OFFSET_M = 260;

/** Unit vector of the take-off direction in x/z. */
export function runwayDirection(a: Airfield): { x: number; z: number } {
  return { x: Math.sin(a.headingRad), z: -Math.cos(a.headingRad) };
}

/** Position relative to the runway centre: `u` along the take-off direction, `v` to its right. */
export function airfieldLocal(a: Airfield, x: number, z: number): { u: number; v: number } {
  const d = runwayDirection(a);
  const dx = x - a.x;
  const dz = z - a.z;
  return { u: dx * d.x + dz * d.z, v: dx * -d.z + dz * d.x };
}

/** Back to map coordinates from runway-relative ones. */
export function airfieldWorld(a: Airfield, u: number, v: number): { x: number; z: number } {
  const d = runwayDirection(a);
  return { x: a.x + d.x * u - d.z * v, z: a.z + d.z * u + d.x * v };
}

/** The airfield whose flattened ground contains (x, z), or null. */
export function airfieldGroundAt(airfields: readonly Airfield[], x: number, z: number): Airfield | null {
  for (const a of airfields) {
    const { u, v } = airfieldLocal(a, x, z);
    if (Math.abs(u) <= a.lengthM / 2 + AIRFIELD_GROUND_OVERRUN_M && Math.abs(v) <= AIRFIELD_GROUND_HALF_WIDTH_M) return a;
  }
  return null;
}
