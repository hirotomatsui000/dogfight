import { kestrel } from './kestrel.ts';
import { kobchik } from './kobchik.ts';
import type { AircraftConfig, TeamId } from './types.ts';
import { assertValidAircraftConfig } from './validate.ts';

/** Add new aircraft here — no other code changes are needed. */
const ALL: readonly AircraftConfig[] = [kestrel, kobchik];

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
