import type { AircraftConfig, TeamId } from '../data/aircraft/types.ts';
import type { ControlInput } from '../physics/controls.ts';
import type { FlightState } from '../physics/flight-model.ts';

export interface AircraftEntity {
  readonly id: number;
  readonly callsign: string;
  team: TeamId;
  config: AircraftConfig;
  readonly isBot: boolean;
  flight: FlightState;
  /** last applied (sanitized) input */
  input: ControlInput;
  alive: boolean;
  hp: number;
  /** increments on every spawn; clients use it to avoid interpolating across a respawn */
  spawnGen: number;
  /** tick at which a destroyed aircraft respawns, -1 while alive */
  respawnAtTick: number;
  outOfBoundsTicks: number;
  kills: number;
  deaths: number;
  spawnSlot: number;
}
