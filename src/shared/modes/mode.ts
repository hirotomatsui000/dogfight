import type { TeamId } from '../data/aircraft/types.ts';
import type { GroundTargetSpec, MapDefinition, SpawnSpec } from '../data/maps/map-definition.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { DeathCause } from '../world/events.ts';
import type { GroundTarget } from '../world/ground-targets.ts';
import type { Missile } from '../weapons/missile.ts';

export type ModeId = 'free-flight' | 'team-deathmatch' | 'air-superiority' | 'team-objective' | 'strike' | 'training';

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

/** Training progress for the HUD (spec §24, M1c). */
export interface TrainingStatus {
  step: TrainingStepId;
  /** 1-based number of the current lesson, `total` when finished */
  index: number;
  total: number;
  /** the next ring to fly through (step "fly") */
  ring: { x: number; y: number; z: number } | null;
  ringsPassed: number;
  ringsTotal: number;
  /** the drone of the current lesson */
  droneId: number | null;
  /** how many times the current lesson has started (2+ after being shot down) */
  attempt: number;
}

export type TrainingStepId = 'fly' | 'gun' | 'missile' | 'defend' | 'done';

export interface ModeStatus {
  modeId: ModeId;
  label: string;
  scores: Record<TeamId, number> | null;
  timeLeftS: number | null;
  winner: TeamId | 'draw' | null;
  strike?: StrikeStatus;
  training?: TrainingStatus;
}

/** The part of the World a mode may read. Keeps modes independent of World internals. */
export interface ModeContext {
  readonly tick: number;
  readonly tickRate: number;
  aircraftList(): Iterable<AircraftEntity>;
  groundTargetList(): readonly GroundTarget[];
}

/** A target drone flying a level right-hand orbit that starts at (x, z) along `headingRad`. */
export interface DroneSpec {
  team: TeamId;
  aircraftId: string;
  callsign: string;
  x: number;
  z: number;
  altitudeM: number;
  /** 0 = north (-z), PI/2 = east (+x) */
  headingRad: number;
  orbit: { radiusM: number; speedMs: number };
}

/** World powers a scripted mode (training) may use each tick, through `GameMode.direct`. */
export interface ModeDirector extends ModeContext {
  getAircraft(id: number): AircraftEntity | undefined;
  missileList(): readonly Missile[];
  addDrone(spec: DroneSpec): AircraftEntity;
  removeAircraft(id: number): boolean;
  /** Fires a short-range missile from `shooterId` at `targetId` without a lock; returns the missile id. */
  launchMissileAt(shooterId: number, targetId: number): number | null;
  /** Full hit points and stores, as on a fresh spawn, without moving the aircraft. */
  restock(id: number): void;
}

export interface GameMode {
  readonly id: ModeId;
  readonly combatEnabled: boolean;
  readonly respawnDelayS: number;
  /** Pilots who ask for it start on their team's runway (M4); others always start in the air. */
  readonly runwayStarts?: boolean;
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
  /** Scripted modes act on the World here, after `update`, once per tick. */
  direct?(director: ModeDirector): void;
}
