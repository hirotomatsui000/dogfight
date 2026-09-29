import type { TeamId } from '../data/aircraft/types.ts';
import { getAircraft } from '../data/aircraft/registry.ts';
import type { MapDefinition } from '../data/maps/map-definition.ts';
import type { Terrain } from '../map/terrain.ts';
import { Rng } from '../math/rng.ts';
import type { GameMode, ModeContext } from '../modes/mode.ts';
import { type ControlInput, neutralInput, sanitizeInput } from '../physics/controls.ts';
import { stepFlight } from '../physics/flight-model.ts';
import type { AircraftEntity } from './entities.ts';
import type { DeathCause, GameEvent } from './events.ts';
import { spawnFlightState } from './spawns.ts';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const BOUNDARY_GRACE_S = 15;
export const CEILING_M = 18000;
export const GROUND_CLEARANCE_M = 2;

export interface WorldOptions {
  map: MapDefinition;
  terrain: Terrain;
  mode: GameMode;
  seed: number;
}

export interface AddAircraftOptions {
  callsign: string;
  team: TeamId;
  aircraftId: string;
  isBot?: boolean;
}

/** Authoritative simulation. Pure: no I/O, no clocks, randomness only from `rng`. */
export class World implements ModeContext {
  readonly tickRate = TICK_RATE;
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  readonly mode: GameMode;
  readonly rng: Rng;
  tick = 0;
  private readonly aircraft = new Map<number, AircraftEntity>();
  private events: GameEvent[] = [];
  private nextId = 1;

  constructor(opts: WorldOptions) {
    this.map = opts.map;
    this.terrain = opts.terrain;
    this.mode = opts.mode;
    this.rng = new Rng(opts.seed);
  }

  aircraftList(): IterableIterator<AircraftEntity> {
    return this.aircraft.values();
  }

  getAircraft(id: number): AircraftEntity | undefined {
    return this.aircraft.get(id);
  }

  addAircraft(opts: AddAircraftOptions): AircraftEntity {
    const config = getAircraft(opts.aircraftId);
    if (config.team !== opts.team) {
      throw new Error(`${config.name} does not fly for team ${opts.team}`);
    }
    let slot = 0;
    for (const other of this.aircraft.values()) if (other.team === opts.team) slot++;
    const entity: AircraftEntity = {
      id: this.nextId++,
      callsign: opts.callsign,
      team: opts.team,
      config,
      isBot: opts.isBot ?? false,
      flight: spawnFlightState(this.map, this.terrain, opts.team, slot, config.physics),
      input: neutralInput(0.8),
      alive: true,
      hp: config.damage.hitPoints,
      spawnGen: 1,
      respawnAtTick: -1,
      outOfBoundsTicks: 0,
      kills: 0,
      deaths: 0,
      spawnSlot: slot,
    };
    this.aircraft.set(entity.id, entity);
    this.events.push({ type: 'spawned', aircraftId: entity.id, spawnGen: entity.spawnGen });
    return entity;
  }

  removeAircraft(id: number): boolean {
    return this.aircraft.delete(id);
  }

  step(inputs: ReadonlyMap<number, ControlInput>): void {
    for (const a of this.aircraft.values()) {
      if (!a.alive) continue;
      const raw = inputs.get(a.id);
      if (raw) sanitizeInput(raw, a.input);
      stepFlight(a.flight, a.input, a.config.physics, DT);
    }
    for (const a of this.aircraft.values()) {
      if (!a.alive) continue;
      const p = a.flight.pos;
      if (p.y < this.terrain.surfaceAt(p.x, p.z) + GROUND_CLEARANCE_M) {
        this.destroy(a, 'crash', null);
        continue;
      }
      if (this.isOutOfBounds(a)) {
        a.outOfBoundsTicks++;
        if (a.outOfBoundsTicks >= BOUNDARY_GRACE_S * TICK_RATE) this.destroy(a, 'boundary', null);
      } else {
        a.outOfBoundsTicks = 0;
      }
    }
    for (const a of this.aircraft.values()) {
      if (!a.alive && a.respawnAtTick >= 0 && this.tick >= a.respawnAtTick) this.respawn(a);
    }
    this.mode.update(this);
    this.tick++;
  }

  drainEvents(): GameEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  isOutOfBounds(a: AircraftEntity): boolean {
    const c = this.map.combatArea;
    const dx = a.flight.pos.x - c.x;
    const dz = a.flight.pos.z - c.z;
    return dx * dx + dz * dz > c.radiusM * c.radiusM || a.flight.pos.y > CEILING_M;
  }

  /** Seconds until a boundary kill, or null when the aircraft is not currently counting down. */
  boundarySecondsLeft(a: AircraftEntity): number | null {
    if (a.outOfBoundsTicks === 0) return null;
    return (BOUNDARY_GRACE_S * TICK_RATE - a.outOfBoundsTicks) / TICK_RATE;
  }

  private destroy(a: AircraftEntity, cause: DeathCause, killer: AircraftEntity | null): void {
    a.alive = false;
    a.deaths++;
    a.outOfBoundsTicks = 0;
    a.respawnAtTick = this.tick + Math.round(this.mode.respawnDelayS * TICK_RATE);
    if (killer) killer.kills++;
    this.events.push({ type: 'destroyed', aircraftId: a.id, cause, killerId: killer ? killer.id : null });
    this.mode.onAircraftDestroyed(this, a, killer, cause);
  }

  private respawn(a: AircraftEntity): void {
    a.flight = spawnFlightState(this.map, this.terrain, a.team, a.spawnSlot, a.config.physics);
    a.alive = true;
    a.hp = a.config.damage.hitPoints;
    a.spawnGen++;
    a.respawnAtTick = -1;
    a.outOfBoundsTicks = 0;
    this.events.push({ type: 'spawned', aircraftId: a.id, spawnGen: a.spawnGen });
  }
}
