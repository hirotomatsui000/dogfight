import { Vector3 } from 'three';
import { CANNONS, COUNTERMEASURES } from '../data/weapons.ts';
import { timeToImpact } from '../map/ground-proximity.ts';
import type { Terrain } from '../map/terrain.ts';
import { Rng } from '../math/rng.ts';
import { clamp, DEG } from '../math/units.ts';
import { cornerSpeed } from '../physics/aero.ts';
import { type AirData, atmosphere } from '../physics/atmosphere.ts';
import type { ControlInput } from '../physics/controls.ts';
import type { FlightState } from '../physics/flight-model.ts';
import { incomingMissileWarning, type MissileWarning } from '../targeting/warnings.ts';
import { leadDirection } from '../weapons/lead.ts';
import type { Missile } from '../weapons/missile.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { DifficultyProfile } from './difficulty.ts';
import { steerToward, type SteerOutput } from './steering.ts';

/** What a bot may read from the World. */
export interface BotWorld {
  readonly tick: number;
  readonly tickRate: number;
  readonly terrain: Terrain;
  readonly combatArea: { readonly x: number; readonly z: number; readonly radiusM: number };
  aircraftList(): Iterable<AircraftEntity>;
  getAircraft(id: number): AircraftEntity | undefined;
  missileList(): Iterable<Missile>;
}

const GROUND_HORIZON_S = 5;
const GROUND_MARGIN_M = 150;
const RECOVERY_CLIMB_RAD = 30 * DEG;
const BOUNDARY_FRACTION = 0.9;
const CEILING_M = 14000;
const PATROL_ALTITUDE_M = 4000;
const MIN_ENGAGE_ALTITUDE_M = 2500;
const SRM_MIN_RANGE_M = 500;
const SRM_MAX_RANGE_M = 7000;
/** Rough speed the missile gains over the launcher, for estimating time to intercept. */
const SRM_SPEED_GAIN_MS = 450;
const SRM_MAX_INTERCEPT_S = 12;
const MISSILES_PER_TARGET_INTERVAL_S = 5;
const AIM_NOISE_HOLD_S = 0.5;
const LEAD_PURSUIT_RANGE_M = 2500;
const DEFEND_DIVE_ABOVE_M = 1500;
/** Break away from a target this close that is still closing fast, instead of flying into it. */
const COLLISION_BREAK_RANGE_M = 350;
const COLLISION_BREAK_CLOSURE_MS = 100;
const UP = new Vector3(0, 1, 0);

/** Bot seed per aircraft, so bots differ but stay deterministic for a World seed. */
export function botSeed(worldSeed: number, aircraftId: number): number {
  return (Math.imul(worldSeed, 0x9e3779b1) ^ Math.imul(aircraftId, 0x85ebca6b)) >>> 0;
}

/**
 * AI pilot (spec §14). It sees the world one reaction time late and flies through the same ControlInput as a human,
 * so it obeys the same physics. Priorities: avoid the ground, stay in the area, defend against missiles, fight,
 * patrol.
 */
export class BotPilot {
  readonly profile: DifficultyProfile;
  private readonly rng: Rng;
  private aimYaw = 0;
  private aimPitch = 0;
  private aimHoldUntilTick = 0;
  private warnedSinceTick = -1;
  private nextFlareDecisionTick = 0;
  private readonly lastLaunchTick = new Map<number, number>();
  private readonly steer: SteerOutput = { pitch: 0, roll: 0, yaw: 0 };
  private readonly air: AirData = { density: 0, temperature: 0, speedOfSound: 0, sigma: 0 };
  private readonly desired = new Vector3();
  private readonly tPos = new Vector3();
  private readonly tVel = new Vector3();
  private readonly lead = new Vector3();
  private readonly aim = new Vector3();
  private readonly toTarget = new Vector3();
  private readonly goal = new Vector3();
  private readonly rel = new Vector3();
  private readonly nose = new Vector3();
  private readonly right = new Vector3();
  private readonly upAxis = new Vector3();

  constructor(profile: DifficultyProfile, seed: number) {
    this.profile = profile;
    this.rng = new Rng(seed);
  }

  think(world: BotWorld, self: AircraftEntity, out: ControlInput): ControlInput {
    out.airbrake = false;
    out.fireCannon = false;
    out.fireMissile = false;
    out.countermeasures = false;
    out.cycleTarget = false;
    out.weapon = 'srm';
    out.helmetSight = false;
    out.lookYaw = 0;
    out.lookPitch = 0;
    const reactionTicks = Math.round(this.profile.reactionS * world.tickRate);
    if (world.tick >= this.aimHoldUntilTick) {
      this.aimYaw = this.rng.gaussian() * this.profile.aimNoiseDeg * DEG;
      this.aimPitch = this.rng.gaussian() * this.profile.aimNoiseDeg * DEG;
      this.aimHoldUntilTick = world.tick + Math.round(AIM_NOISE_HOLD_S * world.tickRate);
    }
    const warning = incomingMissileWarning(self, world.missileList());
    if (!warning) this.warnedSinceTick = -1;
    else if (this.warnedSinceTick < 0) this.warnedSinceTick = world.tick;
    const reacting = warning !== null && world.tick - this.warnedSinceTick >= reactionTicks;
    out.countermeasures = reacting && this.decideFlares(world, self);

    if (this.avoidGround(world, self.flight, out)) return out;
    if (this.returnToArea(world, self.flight, out)) return out;
    if (reacting && warning && this.defend(world, self.flight, warning, out)) return out;
    const target = this.perceiveTarget(world, self, reactionTicks);
    if (target) this.engage(world, self, target, out);
    else this.patrol(world, self, reactionTicks, out);
    return out;
  }

  private fly(f: FlightState, dir: Vector3, maxPull: number, throttle: number, out: ControlInput): void {
    steerToward(f, dir, { maxPull }, this.steer);
    out.pitch = this.steer.pitch;
    out.roll = this.steer.roll;
    out.yaw = this.steer.yaw;
    out.throttle = throttle;
  }

  private decideFlares(world: BotWorld, self: AircraftEntity): boolean {
    if (self.stores.countermeasures <= 0 || world.tick < this.nextFlareDecisionTick) return false;
    this.nextFlareDecisionTick = world.tick + Math.ceil(COUNTERMEASURES.minIntervalS * world.tickRate);
    return this.rng.next() < this.profile.countermeasureDiscipline;
  }

  private avoidGround(world: BotWorld, f: FlightState, out: ControlInput): boolean {
    if (timeToImpact(f, world.terrain, GROUND_HORIZON_S, 0.25, GROUND_MARGIN_M) === null) return false;
    this.desired.set(f.vel.x, 0, f.vel.z);
    if (this.desired.lengthSq() < 1) this.desired.set(0, 0, -1);
    this.desired.normalize().setY(Math.tan(RECOVERY_CLIMB_RAD)).normalize();
    this.fly(f, this.desired, 1, 1, out);
    return true;
  }

  private returnToArea(world: BotWorld, f: FlightState, out: ControlInput): boolean {
    const c = world.combatArea;
    const dx = f.pos.x - c.x;
    const dz = f.pos.z - c.z;
    const leaving = dx * dx + dz * dz > (BOUNDARY_FRACTION * c.radiusM) ** 2 && dx * f.vel.x + dz * f.vel.z > 0;
    const high = f.pos.y > CEILING_M;
    if (!leaving && !high) return false;
    this.desired.set(-dx, 0, -dz);
    if (this.desired.lengthSq() < 1) this.desired.set(0, 0, -1);
    this.desired.normalize().setY(high ? -0.3 : 0).normalize();
    this.fly(f, this.desired, this.profile.maxPull, 0.9, out);
    return true;
  }

  /** Turns to put the missile on the beam and pulls hard; the flares are decided separately. */
  private defend(world: BotWorld, f: FlightState, warning: MissileWarning, out: ControlInput): boolean {
    let missile: Missile | null = null;
    for (const m of world.missileList()) if (m.id === warning.missileId) missile = m;
    if (!missile) return false;
    this.rel.subVectors(f.pos, missile.pos).setY(0);
    this.desired.crossVectors(this.rel, UP);
    if (this.desired.lengthSq() < 1e-6) this.desired.set(1, 0, 0);
    this.desired.normalize();
    if (this.desired.dot(f.vel) < 0) this.desired.negate();
    if (f.pos.y - world.terrain.surfaceAt(f.pos.x, f.pos.z) > DEFEND_DIVE_ABOVE_M) this.desired.setY(-0.25).normalize();
    // Disciplined pilots come off afterburner, which makes flares twice as effective.
    this.fly(f, this.desired, 1, this.profile.countermeasureDiscipline >= 0.8 ? 0.85 : 1, out);
    return true;
  }

  /** The designated (or nearest) enemy contact, seen one reaction time late. */
  private perceiveTarget(world: BotWorld, self: AircraftEntity, reactionTicks: number): AircraftEntity | null {
    let target = self.targetId === null ? undefined : world.getAircraft(self.targetId);
    if (!target || !target.alive || target.team === self.team) {
      target = undefined;
      let nearest = Infinity;
      for (const c of self.contacts) {
        const t = world.getAircraft(c.id);
        if (t && t.alive && c.rangeM < nearest) {
          nearest = c.rangeM;
          target = t;
        }
      }
    }
    if (!target || !target.history.perceive(reactionTicks, 1 / world.tickRate, this.tPos, this.tVel)) return null;
    return target;
  }

  private engage(world: BotWorld, self: AircraftEntity, target: AircraftEntity, out: ControlInput): void {
    const f = self.flight;
    const p = this.profile;
    const air = atmosphere(f.pos.y, this.air);
    const cannon = CANNONS[self.config.stores.cannon];
    const range = f.pos.distanceTo(this.tPos);
    leadDirection(f.pos, f.vel, this.tPos, this.tVel, cannon.muzzleSpeedMs, cannon.dragPerM * air.sigma, this.lead);
    this.right.crossVectors(this.lead, UP);
    if (this.right.lengthSq() < 1e-9) this.right.set(1, 0, 0);
    this.right.normalize();
    this.upAxis.crossVectors(this.right, this.lead).normalize();
    this.aim.copy(this.lead).addScaledVector(this.right, Math.tan(this.aimYaw)).addScaledVector(this.upAxis, Math.tan(this.aimPitch)).normalize();
    this.toTarget.subVectors(this.tPos, f.pos).normalize();
    const closure = -this.rel.subVectors(this.tVel, f.vel).dot(this.toTarget);
    out.airbrake = range < 600 && closure > 80;
    if (range < COLLISION_BREAK_RANGE_M && closure > COLLISION_BREAK_CLOSURE_MS) {
      this.desired.copy(f.vel).normalize().sub(this.toTarget).normalize();
      this.fly(f, this.desired, 1, 1, out);
      return;
    }
    // Far away: pure pursuit, but don't follow a low target down toward the ground.
    this.desired.copy(this.toTarget);
    if (this.tPos.y < MIN_ENGAGE_ALTITUDE_M) this.desired.setY(Math.max(this.desired.y, 0)).normalize();
    // Below corner speed, ease the pull instead of bleeding more energy.
    const corner = cornerSpeed(self.config.physics, air.density);
    const energyPull = f.airspeed >= corner ? 1 : clamp((f.airspeed - 0.5 * corner) / (0.5 * corner), 0.4, 1);
    this.fly(f, range < LEAD_PURSUIT_RANGE_M ? this.aim : this.desired, p.maxPull * energyPull, range < 1000 && closure > 40 ? 0.6 : 1, out);

    this.nose.set(0, 0, -1).applyQuaternion(f.quat);
    out.fireCannon = range <= p.gunRangeM && self.stores.cannonRounds > 0 && this.nose.angleTo(this.aim) <= p.fireThresholdDeg * DEG;

    const s = self.seeker;
    if (s.mode !== 'locked' || s.targetId !== target.id || self.stores.srm <= 0) return;
    if (range < SRM_MIN_RANGE_M || range > SRM_MAX_RANGE_M) return;
    if (range / Math.max(closure + SRM_SPEED_GAIN_MS, 1) > SRM_MAX_INTERCEPT_S) return;
    const last = this.lastLaunchTick.get(target.id);
    if (last !== undefined && world.tick - last < MISSILES_PER_TARGET_INTERVAL_S * world.tickRate) return;
    out.fireMissile = true;
    this.lastLaunchTick.set(target.id, world.tick);
  }

  /** Heads for the nearest enemy (where it was last heard of) or the middle of the area. */
  private patrol(world: BotWorld, self: AircraftEntity, reactionTicks: number, out: ControlInput): void {
    const f = self.flight;
    let nearest = Infinity;
    for (const a of world.aircraftList()) {
      if (!a.alive || a.team === self.team) continue;
      if (!a.history.perceive(reactionTicks, 1 / world.tickRate, this.tPos, this.tVel)) continue;
      const d = this.tPos.distanceTo(f.pos);
      if (d < nearest) {
        nearest = d;
        this.goal.copy(this.tPos);
      }
    }
    if (nearest === Infinity) this.goal.set(world.combatArea.x, PATROL_ALTITUDE_M, world.combatArea.z);
    const goalAltitude = Math.max(this.goal.y, MIN_ENGAGE_ALTITUDE_M);
    this.desired.subVectors(this.goal, f.pos).setY(0);
    if (this.desired.lengthSq() < 1) this.desired.set(0, 0, -1).applyQuaternion(f.quat).setY(0);
    this.desired.normalize().setY(clamp((goalAltitude - f.pos.y) / 3000, -0.35, 0.35)).normalize();
    this.fly(f, this.desired, Math.min(this.profile.maxPull, 0.6), 0.9, out);
  }
}
