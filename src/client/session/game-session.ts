import type { Quaternion, Vector3 } from 'three';
import type { AircraftConfig, TeamId } from '../../shared/data/aircraft/types.ts';
import type { MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import type { ModeStatus } from '../../shared/modes/mode.ts';
import type { ControlInput } from '../../shared/physics/controls.ts';
import type { FlightState } from '../../shared/physics/flight-model.ts';
import type { GameEvent } from '../../shared/world/events.ts';

/** What the renderer and HUD may know about an aircraft. Local and network sessions both provide it. */
export interface AircraftView {
  readonly id: number;
  readonly callsign: string;
  readonly team: TeamId;
  readonly config: AircraftConfig;
  readonly isLocal: boolean;
  readonly isBot: boolean;
  alive: boolean;
  hp: number;
  spawnGen: number;
  /** interpolated for smooth rendering */
  readonly position: Vector3;
  /** interpolated for smooth rendering */
  readonly quaternion: Quaternion;
  /** latest simulated state, for HUD readouts */
  flight: FlightState;
  boundarySecondsLeft: number | null;
}

export interface GameSession {
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  readonly localId: number | null;
  update(frameDtS: number, input: ControlInput): void;
  views(): Iterable<AircraftView>;
  localView(): AircraftView | null;
  drainEvents(): GameEvent[];
  modeStatus(): ModeStatus;
  dispose(): void;
}
