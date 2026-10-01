import { listAircraft } from '../data/aircraft/registry.ts';
import type { TeamId } from '../data/aircraft/types.ts';
import type { MapDefinition } from '../data/maps/map-definition.ts';
import type { Terrain } from '../map/terrain.ts';
import type { StrikeEndReason } from '../modes/mode.ts';
import { STRIKE_ATTACKER, STRIKE_DEFENDER, StrikeMode } from '../modes/strike.ts';
import { TICK_RATE, World } from '../world/world.ts';
import type { DifficultyProfile } from './difficulty.ts';

export interface StrikeSides {
  attacker: DifficultyProfile;
  /** null: nobody defends */
  defender: DifficultyProfile | null;
  /** jets (aircraft ids); by default the first of each team */
  attackerJet?: string;
  defenderJet?: string;
}

export interface StrikeMatchResult {
  winner: TeamId;
  reason: StrikeEndReason;
  timeS: number;
  targetsDestroyed: number;
}

const NO_INPUTS = new Map();

function firstAircraft(team: TeamId): string {
  const [a] = listAircraft(team);
  if (!a) throw new Error(`No aircraft is registered for team ${team}`);
  return a.id;
}

/** A whole Strike match between bots (spec §13.1), for AI and balance tests. */
export function runStrikeMatch(map: MapDefinition, terrain: Terrain, sides: StrikeSides, seed: number): StrikeMatchResult {
  const mode = new StrikeMode();
  const world = new World({ map, terrain, mode, seed });
  world.addAircraft({ callsign: 'Attacker', team: STRIKE_ATTACKER, aircraftId: sides.attackerJet ?? firstAircraft(STRIKE_ATTACKER), bot: sides.attacker });
  if (sides.defender) {
    world.addAircraft({ callsign: 'Defender', team: STRIKE_DEFENDER, aircraftId: sides.defenderJet ?? firstAircraft(STRIKE_DEFENDER), bot: sides.defender });
  }
  const maxTicks = Math.ceil((mode.options.timeLimitS + 1) * TICK_RATE);
  for (let i = 0; i < maxTicks; i++) {
    world.step(NO_INPUTS);
    world.drainEvents();
    const s = mode.status(world);
    if (s.winner === null || s.winner === 'draw' || !s.strike?.reason) continue;
    return { winner: s.winner, reason: s.strike.reason, timeS: world.tick / TICK_RATE, targetsDestroyed: s.strike.targetsDestroyed };
  }
  throw new Error('A Strike match always ends within its time limit');
}
