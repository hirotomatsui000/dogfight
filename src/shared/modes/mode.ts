import type { TeamId } from '../data/aircraft/types.ts';
import type { GroundTargetSpec, MapDefinition, SpawnSpec } from '../data/maps/map-definition.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { DeathCause } from '../world/events.ts';
import type { GroundTarget } from '../world/ground-targets.ts';

export type ModeId = 'free-flight' | 'team-deathmatch' | 'air-superiority' | 'team-objective' | 'strike';

export type StrikeEndReason = 'targets-destroyed' | 'targets-held' | 'out-of-aircraft';

/** Strike details for the HUD and the match-end screen (spec §13.1). */
export interface StrikeStatus {
  attacker: TeamId;
  defender: TeamId;
  aircraftLeft: Record<TeamId, number>;
  targetsDestroyed: number;
  targetsToWin: number;
  reason: StrikeEndReason | null;
}

export interface ModeStatus {
  modeId: ModeId;
  label: string;
  scores: Record<TeamId, number> | null;
  timeLeftS: number | null;
  winner: TeamId | 'draw' | null;
  strike?: StrikeStatus;
}

/** The part of the World a mode may read. Keeps modes independent of World internals. */
export interface ModeContext {
  readonly tick: number;
  readonly tickRate: number;
  aircraftList(): Iterable<AircraftEntity>;
  groundTargetList(): readonly GroundTarget[];
}

export interface GameMode {
  readonly id: ModeId;
  readonly combatEnabled: boolean;
  readonly respawnDelayS: number;
  /** Where a team spawns; most modes use the map's spawn lines. */
  spawnPoint(map: MapDefinition, team: TeamId): SpawnSpec;
  /** Ground targets the World places at the start (Strike); none elsewhere. */
  groundTargets(map: MapDefinition): readonly GroundTargetSpec[];
  /** Bombs on each new aircraft of a team (Strike attackers); 0 elsewhere. */
  bombLoad(team: TeamId): number;
  /** False once a team has no aircraft left (Strike). */
  canRespawn(team: TeamId): boolean;
  onAircraftDestroyed(ctx: ModeContext, victim: AircraftEntity, killer: AircraftEntity | null, cause: DeathCause): void;
  update(ctx: ModeContext): void;
  status(ctx: ModeContext): ModeStatus;
}
