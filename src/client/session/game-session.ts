import type { Quaternion, Vector3 } from 'three';
import type { AircraftConfig, TeamId } from '../../shared/data/aircraft/types.ts';
import type { GroundTargetKind, MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import type { ModeStatus } from '../../shared/modes/mode.ts';
import type { ControlInput } from '../../shared/physics/controls.ts';
import type { FlightState } from '../../shared/physics/flight-model.ts';
import type { SeekerState } from '../../shared/targeting/ir-seeker.ts';
import type { Contact } from '../../shared/targeting/sensors.ts';
import type { MissileWarning } from '../../shared/targeting/warnings.ts';
import type { StoresState } from '../../shared/world/entities.ts';
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
  kills: number;
  deaths: number;
  firingCannon: boolean;
  stores: Readonly<StoresState>;
  /** bombs each new aircraft of this one carries in this mode; 0 = none */
  readonly bombLoad: number;
  /** designated target */
  targetId: number | null;
  contacts: readonly Contact[];
  seeker: Readonly<SeekerState>;
  /** nearest missile guiding on this aircraft inside warning range */
  incoming: MissileWarning | null;
}

export interface MissileView {
  readonly id: number;
  readonly team: TeamId;
  readonly ownerId: number;
  targetId: number | null;
  /** interpolated for smooth rendering */
  readonly position: Vector3;
  readonly velocity: Vector3;
  motorBurning: boolean;
}

/** A Strike target as the renderer and HUD see it. */
export interface GroundTargetView {
  readonly id: string;
  readonly kind: GroundTargetKind;
  readonly label: string;
  /** center, on the ground */
  readonly position: Vector3;
  readonly maxHp: number;
  hp: number;
  destroyed: boolean;
}

export interface BombView {
  readonly id: number;
  readonly team: TeamId;
  /** interpolated for smooth rendering */
  readonly position: Vector3;
  readonly velocity: Vector3;
}

export interface ProjectileView {
  team: TeamId;
  /** interpolated for smooth rendering */
  readonly position: Vector3;
  readonly velocity: Vector3;
}

export interface GameSession {
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  readonly localId: number | null;
  update(frameDtS: number, input: ControlInput): void;
  views(): Iterable<AircraftView>;
  localView(): AircraftView | null;
  view(id: number): AircraftView | null;
  missiles(): Iterable<MissileView>;
  projectiles(): Iterable<ProjectileView>;
  groundTargets(): readonly GroundTargetView[];
  bombs(): Iterable<BombView>;
  drainEvents(): GameEvent[];
  modeStatus(): ModeStatus;
  dispose(): void;
}
