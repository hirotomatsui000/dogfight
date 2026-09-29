import type { TeamId } from '../data/aircraft/types.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { DeathCause } from '../world/events.ts';

export type ModeId = 'free-flight' | 'team-deathmatch' | 'air-superiority' | 'team-objective';

export interface ModeStatus {
  modeId: ModeId;
  label: string;
  scores: Record<TeamId, number> | null;
  timeLeftS: number | null;
  winner: TeamId | 'draw' | null;
}

/** The part of the World a mode may read. Keeps modes independent of World internals. */
export interface ModeContext {
  readonly tick: number;
  readonly tickRate: number;
  aircraftList(): Iterable<AircraftEntity>;
}

export interface GameMode {
  readonly id: ModeId;
  readonly combatEnabled: boolean;
  readonly respawnDelayS: number;
  onAircraftDestroyed(ctx: ModeContext, victim: AircraftEntity, killer: AircraftEntity | null, cause: DeathCause): void;
  update(ctx: ModeContext): void;
  status(ctx: ModeContext): ModeStatus;
}
