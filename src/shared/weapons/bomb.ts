import { Vector3 } from 'three';
import type { TeamId } from '../data/aircraft/types.ts';
import type { BombSpec } from '../data/weapons.ts';
import type { Terrain } from '../map/terrain.ts';
import { G0 } from '../math/units.ts';
import { type AirData, atmosphere, SEA_LEVEL_DENSITY } from '../physics/atmosphere.ts';
import type { FlightState } from '../physics/flight-model.ts';

/** A free-fall bomb in flight (spec §10.4). */
export interface Bomb {
  id: number;
  ownerId: number;
  team: TeamId;
  spec: BombSpec;
  pos: Vector3;
  /** position at the start of the current tick */
  prevPos: Vector3;
  vel: Vector3;
  ageS: number;
}

export interface BombCarrier {
  id: number;
  team: TeamId;
  flight: FlightState;
}

const air: AirData = { density: 0, temperature: 0, speedOfSound: 0, sigma: 0 };
const p = new Vector3();
const v = new Vector3();
const prev = new Vector3();

/** A bomb leaving the aircraft with the aircraft's position and velocity. */
export function releaseBomb(id: number, carrier: BombCarrier, spec: BombSpec): Bomb {
  const pos = carrier.flight.pos.clone();
  return { id, ownerId: carrier.id, team: carrier.team, spec, pos, prevPos: pos.clone(), vel: carrier.flight.vel.clone(), ageS: 0 };
}

/**
 * One fixed step of gravity plus speed-squared drag (semi-implicit Euler). The World and the impact prediction both
 * use it, so a predicted impact matches the real one.
 */
export function advanceBomb(pos: Vector3, vel: Vector3, spec: BombSpec, density: number, dt: number): void {
  const k = (spec.dragPerM * density) / SEA_LEVEL_DENSITY;
  vel.multiplyScalar(Math.max(0, 1 - k * vel.length() * dt));
  vel.y -= G0 * dt;
  pos.addScaledVector(vel, dt);
}

export function stepBomb(b: Bomb, dt: number): void {
  b.prevPos.copy(b.pos);
  advanceBomb(b.pos, b.vel, b.spec, atmosphere(b.pos.y, air).density, dt);
  b.ageS += dt;
}

function clearance(at: Vector3, terrain: Terrain): number {
  return at.y - terrain.surfaceAt(at.x, at.z);
}

export function hasLanded(b: Bomb, terrain: Terrain): boolean {
  return clearance(b.pos, terrain) <= 0;
}

/** Where the step from `from` (above the surface) to `to` (on or below it) meets the surface. */
export function surfaceCrossing(from: Vector3, to: Vector3, terrain: Terrain, out: Vector3): Vector3 {
  const above = clearance(from, terrain);
  const below = clearance(to, terrain);
  const f = above - below > 1e-9 ? above / (above - below) : 1;
  out.lerpVectors(from, to, Math.min(1, Math.max(0, f)));
  out.y = terrain.surfaceAt(out.x, out.z);
  return out;
}

/**
 * Where a bomb released now from `pos` with `vel` would land, stepping exactly as the World does with the same `dt`.
 * Null when it would not land within the bomb's maximum fall time.
 */
export function predictImpact(pos: Vector3, vel: Vector3, spec: BombSpec, terrain: Terrain, dt: number, out: Vector3): Vector3 | null {
  p.copy(pos);
  v.copy(vel);
  const steps = Math.ceil(spec.maxFallS / dt);
  for (let i = 0; i < steps; i++) {
    prev.copy(p);
    advanceBomb(p, v, spec, atmosphere(p.y, air).density, dt);
    if (clearance(p, terrain) <= 0) return surfaceCrossing(prev, p, terrain, out);
  }
  return null;
}

/** Damage to a ground target whose center is `distanceM` from the impact (spec §10.4). */
export function bombDamage(distanceM: number, spec: BombSpec): number {
  if (distanceM <= spec.fullDamageRadiusM) return spec.damage;
  if (distanceM >= spec.maxDamageRadiusM) return 0;
  return (spec.damage * (spec.maxDamageRadiusM - distanceM)) / (spec.maxDamageRadiusM - spec.fullDamageRadiusM);
}
