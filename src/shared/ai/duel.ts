import { Quaternion, Vector3 } from 'three';
import { getAircraft } from '../data/aircraft/registry.ts';
import type { MapDefinition } from '../data/maps/map-definition.ts';
import type { Terrain } from '../map/terrain.ts';
import { Rng } from '../math/rng.ts';
import { DEG } from '../math/units.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { DeathCause } from '../world/events.ts';
import { TICK_RATE, World } from '../world/world.ts';
import type { DifficultyProfile } from './difficulty.ts';

export interface DuelSide {
  aircraftId: string;
  profile: DifficultyProfile;
}

export interface DuelResult {
  /** index of the side that survived, or null when time ran out */
  winner: 0 | 1 | null;
  cause: DeathCause | null;
  timeS: number;
}

const START_HEADING_SPREAD_RAD = 20 * DEG;
const START_ALTITUDE_SPREAD_M = 600;
const NO_INPUTS = new Map();

/** Nudges a spawned aircraft's heading and altitude so seeded duels start differently. */
function vary(a: AircraftEntity, rng: Rng): void {
  const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rng.range(-START_HEADING_SPREAD_RAD, START_HEADING_SPREAD_RAD));
  a.flight.quat.premultiply(turn);
  a.flight.vel.applyQuaternion(turn);
  a.flight.pos.y += rng.range(-START_ALTITUDE_SPREAD_M, START_ALTITUDE_SPREAD_M);
  a.prevPos.copy(a.flight.pos);
}

/**
 * Two bots from a neutral head-on start (the map's team spawns, 15 km apart) fight until the first death.
 * Used to check that bot skill matters now, and aircraft balance from M3.
 */
export function runDuel(map: MapDefinition, terrain: Terrain, sides: readonly [DuelSide, DuelSide], seed: number, maxTimeS = 180): DuelResult {
  const world = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed });
  const entities = sides.map((s, i) =>
    world.addAircraft({ callsign: `Bot ${i + 1}`, team: getAircraft(s.aircraftId).team, aircraftId: s.aircraftId, bot: s.profile }),
  );
  if (entities[0].team === entities[1].team) throw new Error('A duel needs one aircraft from each team');
  const rng = new Rng(seed ^ 0x5bd1e995);
  for (const e of entities) vary(e, rng);
  for (let tick = 0; tick < maxTimeS * TICK_RATE; tick++) {
    world.step(NO_INPUTS);
    const deaths = world.drainEvents().filter((e) => e.type === 'destroyed');
    if (deaths.length === 0) continue;
    const timeS = (tick + 1) / TICK_RATE;
    // Both down in the same tick (a mid-air collision): nobody won.
    if (deaths.length > 1) return { winner: null, cause: deaths[0].cause, timeS };
    const loser = entities.findIndex((a) => a.id === deaths[0].aircraftId);
    return { winner: loser === 0 ? 1 : 0, cause: deaths[0].cause, timeS };
  }
  return { winner: null, cause: null, timeS: maxTimeS };
}
