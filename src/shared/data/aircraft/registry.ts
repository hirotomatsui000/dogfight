import { condor } from './condor.ts';
import { kestrel } from './kestrel.ts';
import { kobchik } from './kobchik.ts';
import { prizrak } from './prizrak.ts';
import { sapsan } from './sapsan.ts';
import { shade } from './shade.ts';
import { tempest } from './tempest.ts';
import type { AircraftConfig, TeamId } from './types.ts';
import { assertValidAircraftConfig } from './validate.ts';
import { yastreb } from './yastreb.ts';

/** Add new aircraft here — no other code changes are needed. The order is the title screen's (spec §9.2). */
const ALL: readonly AircraftConfig[] = [shade, tempest, kestrel, condor, prizrak, yastreb, sapsan, kobchik];

export const TEAM_NAMES: Record<TeamId, string> = { usa: 'USA', russia: 'Russia' };

export function opposingTeam(team: TeamId): TeamId {
  return team === 'usa' ? 'russia' : 'usa';
}

const byId = new Map<string, AircraftConfig>();
for (const config of ALL) {
  assertValidAircraftConfig(config);
  if (byId.has(config.id)) throw new Error(`Duplicate aircraft id: ${config.id}`);
  byId.set(config.id, config);
}

export function getAircraft(id: string): AircraftConfig {
  const config = byId.get(id);
  if (!config) throw new Error(`Unknown aircraft: ${id}`);
  return config;
}

export function listAircraft(team?: TeamId): AircraftConfig[] {
  return ALL.filter((c) => team === undefined || c.team === team);
}

/** A random jet of `team`, so bots fly a mix of the roster. Pass the simulation's seeded Rng to stay deterministic. */
export function randomAircraft(team: TeamId, rng: { int(n: number): number }): AircraftConfig {
  const jets = listAircraft(team);
  if (jets.length === 0) throw new Error(`No aircraft is registered for team ${team}`);
  return jets[rng.int(jets.length)];
}
