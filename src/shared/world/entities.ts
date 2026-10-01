import type { Vector3 } from 'three';
import type { AircraftConfig, TeamId } from '../data/aircraft/types.ts';
import { clearCredit, type CreditRecord } from '../damage/damage.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import type { FlightState } from '../physics/flight-model.ts';
import { createSeeker, resetSeeker, type SeekerState } from '../targeting/ir-seeker.ts';
import { createRadarLock, type RadarLockState, resetRadarLock } from '../targeting/radar-lock.ts';
import type { Contact } from '../targeting/sensors.ts';
import { TRIGGER_AT_REST } from '../weapons/cannon.ts';
import { MotionHistory } from './history.ts';
import type { SpawnStart } from './spawns.ts';

export interface StoresState {
  cannonRounds: number;
  srm: number;
  mrm: number;
  countermeasures: number;
  bombs: number;
}

/** Long ago: "never fired" for launch and countermeasure intervals. */
export const NEVER = -1e9;

export interface AircraftEntity extends CreditRecord {
  readonly id: number;
  readonly callsign: string;
  team: TeamId;
  config: AircraftConfig;
  readonly isBot: boolean;
  flight: FlightState;
  /** position at the start of the current tick, for swept hit tests */
  readonly prevPos: Vector3;
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
  readonly stores: StoresState;
  cannonAccumulator: number;
  firingCannon: boolean;
  /** last short-range (Dart) launch */
  lastMissileTick: number;
  /** last medium-range (Lance) launch */
  lastMrmTick: number;
  lastCountermeasureTick: number;
  lastBombTick: number;
  /** bombs every new aircraft of this one carries in this mode (Strike attackers) */
  readonly bombLoad: number;
  /** enemies this aircraft currently sees or has on radar */
  readonly contacts: Contact[];
  /** designated target */
  targetId: number | null;
  readonly seeker: SeekerState;
  /** radar lock for the Lance (spec §10.3) */
  readonly radarLock: RadarLockState;
  /** RWR: an enemy radar lock, or a Lance its launcher still guides, is on this aircraft (spec §10.3) */
  lockedByRadar: boolean;
  readonly history: MotionHistory;
  /** online: how many ticks behind this pilot sees the others; cannon hit tests rewind by it (spec §7) */
  viewDelayTicks: number;
  /** where this aircraft starts after each death: in the air or on the runway (M4) */
  start: SpawnStart;
}

export interface NewAircraft {
  id: number;
  callsign: string;
  team: TeamId;
  config: AircraftConfig;
  isBot: boolean;
  flight: FlightState;
  spawnSlot: number;
  bombLoad: number;
  start?: SpawnStart;
}

export function createAircraftEntity(n: NewAircraft): AircraftEntity {
  const entity: AircraftEntity = {
    id: n.id,
    callsign: n.callsign,
    team: n.team,
    config: n.config,
    isBot: n.isBot,
    flight: n.flight,
    prevPos: n.flight.pos.clone(),
    input: neutralInput(0.8),
    alive: true,
    hp: n.config.damage.hitPoints,
    spawnGen: 1,
    respawnAtTick: -1,
    outOfBoundsTicks: 0,
    kills: 0,
    deaths: 0,
    spawnSlot: n.spawnSlot,
    stores: { cannonRounds: 0, srm: 0, mrm: 0, countermeasures: 0, bombs: 0 },
    cannonAccumulator: TRIGGER_AT_REST,
    firingCannon: false,
    lastMissileTick: NEVER,
    lastMrmTick: NEVER,
    lastCountermeasureTick: NEVER,
    lastBombTick: NEVER,
    bombLoad: n.bombLoad,
    contacts: [],
    targetId: null,
    seeker: createSeeker(),
    radarLock: createRadarLock(),
    lockedByRadar: false,
    history: new MotionHistory(),
    viewDelayTicks: 0,
    lastDamagedBy: null,
    lastDamagedTick: -1,
    lastLockedBy: null,
    lastLockedTick: -1,
    start: n.start ?? 'air',
  };
  resetForSpawn(entity);
  return entity;
}

/** Full hit points and stores, cleared targeting and credit: the state of a freshly spawned aircraft. */
export function resetForSpawn(a: AircraftEntity): void {
  const s = a.config.stores;
  a.hp = a.config.damage.hitPoints;
  a.stores.cannonRounds = s.cannonRounds;
  a.stores.srm = s.srm;
  a.stores.mrm = s.mrm;
  a.stores.countermeasures = s.countermeasures;
  a.stores.bombs = a.bombLoad;
  a.cannonAccumulator = TRIGGER_AT_REST;
  a.firingCannon = false;
  a.lastMissileTick = NEVER;
  a.lastMrmTick = NEVER;
  a.lastCountermeasureTick = NEVER;
  a.lastBombTick = NEVER;
  a.contacts.length = 0;
  a.targetId = null;
  resetSeeker(a.seeker, 'off');
  resetRadarLock(a.radarLock, 'off');
  a.lockedByRadar = false;
  a.history.reset();
  a.prevPos.copy(a.flight.pos);
  clearCredit(a);
}
