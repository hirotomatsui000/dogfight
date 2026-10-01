import { Vector3 } from 'three';
import { blastDamage } from '../damage/damage.ts';
import { AFTERBURNER_THROTTLE, BOMB_ANVIL, CANNONS, COUNTERMEASURES, SRM_DART } from '../data/weapons.ts';
import type { Terrain } from '../map/terrain.ts';
import { type Approach, closestApproach } from '../math/closest-approach.ts';
import type { Rng } from '../math/rng.ts';
import { type AirData, atmosphere } from '../physics/atmosphere.ts';
import { autoDesignate, cycleDesignation, isContact } from '../targeting/designation.ts';
import { resetSeeker, updateSeeker } from '../targeting/ir-seeker.ts';
import { detectContacts, RADAR_SCAN_INTERVAL_S } from '../targeting/sensors.ts';
import { advanceProjectile, createProjectile, type Projectile, pullTrigger, TRIGGER_AT_REST } from '../weapons/cannon.ts';
import { decoyChance, rollDecoy } from '../weapons/countermeasures.ts';
import { type Bomb, bombDamage, hasLanded, releaseBomb, stepBomb, surfaceCrossing } from '../weapons/bomb.ts';
import { isArmed, isSpent, launchMissile, type Missile, stepMissile, withinGimbal } from '../weapons/missile.ts';
import type { AircraftEntity } from './entities.ts';
import type { GameEvent, WeaponKind } from './events.ts';
import type { GroundTarget } from './ground-targets.ts';

/** The parts of the World that combat needs. */
export interface CombatHost {
  readonly tick: number;
  readonly tickRate: number;
  readonly terrain: Terrain;
  readonly rng: Rng;
  aircraftList(): Iterable<AircraftEntity>;
  getAircraft(id: number): AircraftEntity | undefined;
  emit(event: GameEvent): void;
  applyDamage(victim: AircraftEntity, amount: number, attacker: AircraftEntity | null, weapon: WeaponKind): void;
  readonly combatArea: { readonly x: number; readonly z: number; readonly radiusM: number };
  groundTargetList(): readonly GroundTarget[];
  applyTargetDamage(target: GroundTarget, amount: number, attacker: AircraftEntity | null): void;
  /** true once the mode has a winner: later bomb impacts do nothing (spec §10.4) */
  matchOver(): boolean;
}

/**
 * Sensors, targeting, cannons, missiles and countermeasures for every aircraft (spec §10). The World steps it
 * after all aircraft have moved. Projectiles and missiles already in flight move before new ones are fired, so
 * every hit test compares movements over the same tick.
 */
export class Combat {
  readonly projectiles: Projectile[] = [];
  readonly missiles: Missile[] = [];
  readonly bombs: Bomb[] = [];
  private readonly host: CombatHost;
  private readonly scanTicks: number;
  private nextProjectileId = 1;
  private nextMissileId = 1;
  private nextBombId = 1;
  private readonly approach: Approach = { distance: 0, fraction: 0 };
  private readonly air: AirData = { density: 0, temperature: 0, speedOfSound: 0, sigma: 0 };
  private readonly burst = new Vector3();
  private readonly victimPos = new Vector3();
  private readonly impact = new Vector3();

  constructor(host: CombatHost) {
    this.host = host;
    this.scanTicks = Math.max(1, Math.round(RADAR_SCAN_INTERVAL_S * host.tickRate));
  }

  step(dt: number): void {
    const host = this.host;
    if (host.tick % this.scanTicks === 0) this.scanSensors();
    this.stepProjectiles(dt);
    this.stepMissiles(dt);
    this.stepBombs(dt);
    for (const a of host.aircraftList()) {
      if (!a.alive) continue;
      if (a.input.cycleTarget) a.targetId = cycleDesignation(a.targetId, a.contacts);
      this.releaseCountermeasures(a);
      this.fireCannon(a, dt);
      this.updateSeeker(a, dt);
      this.launchMissile(a);
      this.dropBomb(a);
    }
  }

  /** Drops every reference to an aircraft that was destroyed or removed. */
  forget(id: number): void {
    for (const a of this.host.aircraftList()) {
      if (a.targetId === id) a.targetId = null;
      const i = a.contacts.findIndex((c) => c.id === id);
      if (i >= 0) a.contacts.splice(i, 1);
      if (a.seeker.targetId === id) resetSeeker(a.seeker, 'search');
    }
    for (const m of this.missiles) if (m.targetId === id) m.targetId = null;
  }

  private scanSensors(): void {
    const host = this.host;
    for (const a of host.aircraftList()) {
      if (!a.alive) continue;
      detectContacts(a, host.aircraftList(), host.terrain, a.contacts);
      if (!isContact(a.targetId, a.contacts)) a.targetId = null;
      if (a.targetId === null) a.targetId = autoDesignate(a.contacts);
    }
  }

  private releaseCountermeasures(a: AircraftEntity): void {
    const host = this.host;
    if (!a.input.countermeasures || a.stores.countermeasures <= 0) return;
    if (host.tick - a.lastCountermeasureTick < COUNTERMEASURES.minIntervalS * host.tickRate) return;
    a.stores.countermeasures--;
    a.lastCountermeasureTick = host.tick;
    host.emit({ type: 'countermeasures', aircraftId: a.id });
    const afterburner = a.flight.throttle > AFTERBURNER_THROTTLE;
    for (const m of this.missiles) {
      if (m.targetId !== a.id || !rollDecoy(host.rng, decoyChance(m.spec, afterburner))) continue;
      m.targetId = null;
      host.emit({ type: 'missileDecoyed', missileId: m.id, targetId: a.id });
    }
  }

  private fireCannon(a: AircraftEntity, dt: number): void {
    const spec = CANNONS[a.config.stores.cannon];
    a.firingCannon = a.input.fireCannon && a.stores.cannonRounds >= spec.roundsPerProjectile;
    if (!a.firingCannon) {
      a.cannonAccumulator = TRIGGER_AT_REST;
      return;
    }
    const shots = pullTrigger(a, spec, dt, a.stores.cannonRounds);
    if (shots === 0) return;
    const density = atmosphere(a.flight.pos.y, this.air).density;
    for (let i = 0; i < shots; i++) {
      this.projectiles.push(createProjectile(this.nextProjectileId++, a, spec, this.host.rng, density));
      a.stores.cannonRounds -= spec.roundsPerProjectile;
    }
  }

  private updateSeeker(a: AircraftEntity, dt: number): void {
    const host = this.host;
    if (a.stores.srm <= 0) {
      if (a.seeker.mode !== 'off') resetSeeker(a.seeker, 'off');
      return;
    }
    const designated = a.targetId === null ? null : (host.getAircraft(a.targetId) ?? null);
    updateSeeker(a.seeker, a, host.aircraftList(), designated, SRM_DART, host.terrain, dt);
    if (a.seeker.mode !== 'locked' || a.seeker.targetId === null) return;
    const target = host.getAircraft(a.seeker.targetId);
    if (target) {
      target.lastLockedBy = a.id;
      target.lastLockedTick = host.tick;
    }
  }

  private launchMissile(a: AircraftEntity): void {
    const host = this.host;
    const s = a.seeker;
    if (!a.input.fireMissile || s.mode !== 'locked' || s.targetId === null || a.stores.srm <= 0) return;
    if (host.tick - a.lastMissileTick < SRM_DART.minLaunchIntervalS * host.tickRate) return;
    const m = launchMissile(this.nextMissileId++, a, s.targetId, SRM_DART);
    this.missiles.push(m);
    a.stores.srm--;
    a.lastMissileTick = host.tick;
    host.emit({ type: 'missileLaunched', missileId: m.id, shooterId: a.id, targetId: s.targetId });
  }

  private dropBomb(a: AircraftEntity): void {
    const host = this.host;
    if (!a.input.dropBomb || a.stores.bombs <= 0) return;
    if (host.tick - a.lastBombTick < BOMB_ANVIL.minReleaseIntervalS * host.tickRate) return;
    const b = releaseBomb(this.nextBombId++, a, BOMB_ANVIL);
    this.bombs.push(b);
    a.stores.bombs--;
    a.lastBombTick = host.tick;
    host.emit({ type: 'bombReleased', bombId: b.id, aircraftId: a.id });
  }

  private stepBombs(dt: number): void {
    const host = this.host;
    const area = host.combatArea;
    const list = this.bombs;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      stepBomb(b, dt);
      const landed = hasLanded(b, host.terrain);
      if (landed) this.explodeBomb(b);
      if (landed || b.ageS >= b.spec.maxFallS || Math.hypot(b.pos.x - area.x, b.pos.z - area.z) > area.radiusM) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  /** Bursts where the bomb met the ground and damages every target in reach, unless the match is already over. */
  private explodeBomb(b: Bomb): void {
    const host = this.host;
    const at = surfaceCrossing(b.prevPos, b.pos, host.terrain, this.impact);
    host.emit({ type: 'bombImpact', bombId: b.id, x: at.x, y: at.y, z: at.z });
    if (host.matchOver()) return;
    const owner = host.getAircraft(b.ownerId) ?? null;
    for (const t of host.groundTargetList()) {
      const damage = bombDamage(at.distanceTo(t.pos), b.spec);
      if (damage > 0) host.applyTargetDamage(t, damage, owner);
    }
  }

  private stepProjectiles(dt: number): void {
    const host = this.host;
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      advanceProjectile(p, dt);
      let done = false;
      for (const t of host.aircraftList()) {
        if (!t.alive || t.team === p.team) continue;
        if (closestApproach(p.prevPos, p.pos, t.prevPos, t.flight.pos, this.approach).distance > t.config.damage.hitRadiusM) continue;
        host.applyDamage(t, p.damage, host.getAircraft(p.ownerId) ?? null, 'cannon');
        done = true;
        break;
      }
      done ||= p.ageS >= p.lifetimeS || p.pos.y < host.terrain.surfaceAt(p.pos.x, p.pos.z);
      if (done) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  private stepMissiles(dt: number): void {
    const host = this.host;
    const list = this.missiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      let target = m.targetId === null ? undefined : host.getAircraft(m.targetId);
      if (m.targetId !== null && (!target || !target.alive || !withinGimbal(m, target.flight.pos) || !host.terrain.lineOfSight(m.pos, target.flight.pos))) {
        m.targetId = null;
        target = undefined;
      }
      stepMissile(m, target ? target.flight : null, atmosphere(m.pos.y, this.air).density, dt);

      let fraction = -1;
      if (isArmed(m)) {
        let nearest = m.spec.fuzeRadiusM;
        for (const t of host.aircraftList()) {
          if (!t.alive || t.team === m.team) continue;
          closestApproach(m.prevPos, m.pos, t.prevPos, t.flight.pos, this.approach);
          if (this.approach.distance <= nearest) {
            nearest = this.approach.distance;
            fraction = this.approach.fraction;
          }
        }
      }
      const nearAircraft = fraction >= 0;
      if (!nearAircraft && m.pos.y >= host.terrain.surfaceAt(m.pos.x, m.pos.z) && !isSpent(m)) continue;
      this.detonate(m, nearAircraft ? fraction : 1, nearAircraft);
      list[i] = list[list.length - 1];
      list.pop();
    }
  }

  /** Bursts at `fraction` of the missile's last step and damages every enemy in blast range. */
  private detonate(m: Missile, fraction: number, nearAircraft: boolean): void {
    const host = this.host;
    this.burst.lerpVectors(m.prevPos, m.pos, fraction);
    host.emit({ type: 'missileDetonated', missileId: m.id, x: this.burst.x, y: this.burst.y, z: this.burst.z, nearAircraft });
    const owner = host.getAircraft(m.ownerId) ?? null;
    for (const t of host.aircraftList()) {
      if (!t.alive || t.team === m.team) continue;
      this.victimPos.lerpVectors(t.prevPos, t.flight.pos, fraction);
      const damage = blastDamage(this.burst.distanceTo(this.victimPos), m.spec);
      if (damage > 0) host.applyDamage(t, damage, owner, 'missile');
    }
  }
}
