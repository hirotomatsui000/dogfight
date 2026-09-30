import { damageFlightEnv, damageState, maneuverKillCredit } from '../damage/damage.ts';
import { getAircraft } from '../data/aircraft/registry.ts';
import type { TeamId } from '../data/aircraft/types.ts';
import type { MapDefinition } from '../data/maps/map-definition.ts';
import type { Terrain } from '../map/terrain.ts';
import { type Approach, closestApproach } from '../math/closest-approach.ts';
import { Rng } from '../math/rng.ts';
import type { GameMode, ModeContext } from '../modes/mode.ts';
import { type ControlInput, sanitizeInput } from '../physics/controls.ts';
import { type FlightEnv, stepFlight } from '../physics/flight-model.ts';
import type { Projectile } from '../weapons/cannon.ts';
import type { Missile } from '../weapons/missile.ts';
import { Combat, type CombatHost } from './combat.ts';
import { type AircraftEntity, createAircraftEntity, resetForSpawn } from './entities.ts';
import type { DeathCause, GameEvent, WeaponKind } from './events.ts';
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
}

/** Authoritative simulation. Pure: no I/O, no clocks, randomness only from `rng`. */
export class World implements ModeContext, CombatHost {
  readonly tickRate = TICK_RATE;
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  readonly mode: GameMode;
  readonly rng: Rng;
  readonly combat: Combat;
  tick = 0;
  private readonly aircraft = new Map<number, AircraftEntity>();
  private events: GameEvent[] = [];
  private nextId = 1;
  private readonly env: FlightEnv = { thrustScale: 1, rollScale: 1 };
  private readonly approach: Approach = { distance: 0, fraction: 0 };
  private readonly living: AircraftEntity[] = [];

  constructor(opts: WorldOptions) {
    this.map = opts.map;
    this.terrain = opts.terrain;
    this.mode = opts.mode;
    this.rng = new Rng(opts.seed);
    this.combat = new Combat(this);
  }

  aircraftList(): IterableIterator<AircraftEntity> {
    return this.aircraft.values();
  }

  getAircraft(id: number): AircraftEntity | undefined {
    return this.aircraft.get(id);
  }

  missileList(): readonly Missile[] {
    return this.combat.missiles;
  }

  projectileList(): readonly Projectile[] {
    return this.combat.projectiles;
  }

  addAircraft(opts: AddAircraftOptions): AircraftEntity {
    const config = getAircraft(opts.aircraftId);
    if (config.team !== opts.team) {
      throw new Error(`${config.name} does not fly for team ${opts.team}`);
    }
    let slot = 0;
    for (const other of this.aircraft.values()) if (other.team === opts.team) slot++;
    const entity = createAircraftEntity({
      id: this.nextId++,
      callsign: opts.callsign,
      team: opts.team,
      config,
      isBot: false,
      flight: spawnFlightState(this.map, this.terrain, opts.team, slot, config.physics),
      spawnSlot: slot,
    });
    this.aircraft.set(entity.id, entity);
    this.emit({ type: 'spawned', aircraftId: entity.id, spawnGen: entity.spawnGen });
    return entity;
  }

  removeAircraft(id: number): boolean {
    if (!this.aircraft.delete(id)) return false;
    this.combat.forget(id);
    return true;
  }

  step(inputs: ReadonlyMap<number, ControlInput>): void {
    for (const a of this.aircraft.values()) {
      if (!a.alive) continue;
      const raw = inputs.get(a.id);
      if (raw) sanitizeInput(raw, a.input);
      a.prevPos.copy(a.flight.pos);
      damageFlightEnv(damageState(a.hp, a.config.damage.hitPoints), this.env);
      stepFlight(a.flight, a.input, a.config.physics, DT, this.env);
      a.history.record(a.flight.pos, a.flight.vel);
    }
    if (this.mode.combatEnabled) this.combat.step(DT);
    this.checkCollisions();
    for (const a of this.aircraft.values()) {
      if (!a.alive) continue;
      const p = a.flight.pos;
      if (p.y < this.terrain.surfaceAt(p.x, p.z) + GROUND_CLEARANCE_M) {
        const credited = maneuverKillCredit(a, this.tick, TICK_RATE);
        this.destroy(a, 'crash', credited === null ? null : (this.aircraft.get(credited) ?? null));
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
      // Button presses act once, even if no new input arrives next tick.
      a.input.cycleTarget = false;
      a.input.countermeasures = false;
      a.input.fireMissile = false;
      if (!a.alive && a.respawnAtTick >= 0 && this.tick >= a.respawnAtTick) this.respawn(a);
    }
    this.mode.update(this);
    this.tick++;
  }

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  drainEvents(): GameEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  /** Weapon damage. Records the attacker for kill credit and destroys the victim at 0 hit points. */
  applyDamage(victim: AircraftEntity, amount: number, attacker: AircraftEntity | null, weapon: WeaponKind): void {
    if (!victim.alive || amount <= 0) return;
    victim.hp = Math.max(0, victim.hp - amount);
    if (attacker && attacker.team !== victim.team) {
      victim.lastDamagedBy = attacker.id;
      victim.lastDamagedTick = this.tick;
    }
    this.emit({ type: 'hit', aircraftId: victim.id, attackerId: attacker ? attacker.id : null, weapon, damage: amount });
    if (victim.hp <= 0) this.destroy(victim, weapon, attacker);
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

  /** Mid-air collisions destroy both aircraft (spec §11); swept so head-on passes can't tunnel. */
  private checkCollisions(): void {
    const list = this.living;
    list.length = 0;
    for (const a of this.aircraft.values()) if (a.alive) list.push(a);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!a.alive || !b.alive) continue;
        const limit = 0.5 * (a.config.damage.hitRadiusM + b.config.damage.hitRadiusM);
        if (closestApproach(a.prevPos, a.flight.pos, b.prevPos, b.flight.pos, this.approach).distance > limit) continue;
        this.destroy(a, 'collision', null);
        this.destroy(b, 'collision', null);
      }
    }
  }

  private destroy(a: AircraftEntity, cause: DeathCause, killer: AircraftEntity | null): void {
    a.alive = false;
    a.deaths++;
    a.outOfBoundsTicks = 0;
    a.firingCannon = false;
    a.respawnAtTick = this.tick + Math.round(this.mode.respawnDelayS * TICK_RATE);
    if (killer && killer.team !== a.team) killer.kills++;
    this.emit({ type: 'destroyed', aircraftId: a.id, cause, killerId: killer ? killer.id : null });
    this.combat.forget(a.id);
    this.mode.onAircraftDestroyed(this, a, killer, cause);
  }

  private respawn(a: AircraftEntity): void {
    a.flight = spawnFlightState(this.map, this.terrain, a.team, a.spawnSlot, a.config.physics);
    a.alive = true;
    a.spawnGen++;
    a.respawnAtTick = -1;
    a.outOfBoundsTicks = 0;
    resetForSpawn(a);
    this.emit({ type: 'spawned', aircraftId: a.id, spawnGen: a.spawnGen });
  }
}
