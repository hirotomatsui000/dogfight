import { Color, type Scene, Vector3 } from 'three';
import { damageState } from '../../../shared/damage/damage.ts';
import type { GameEvent } from '../../../shared/world/events.ts';
import type { AircraftView, GameSession, MissileView } from '../../session/game-session.ts';
import { MissileModels } from './missile-models.ts';
import { type ParticleFrame, ParticleSystem } from './particles.ts';
import { Tracers } from './tracers.ts';

const SMOKE_CAPACITY = 6000;
const FIRE_CAPACITY = 3000;
const TRAIL_SPACING_M = 7;
const FLARES_PER_SALVO = 2;
const FLARE_BURN_S = 3;
const DAMAGE_SMOKE_INTERVAL_S = 0.04;

const FIRE = [new Color(0xffd27a), new Color(0xff8a2a), new Color(0xff5a14)];
const DARK_SMOKE = new Color(0x2a2a2a);
const GREY_SMOKE = new Color(0x7d7d7d);
const TRAIL_SMOKE = new Color(0xd8d8d8);
const MOTOR = new Color(0xffe2b0);
const FLARE = new Color(0xfff4d0);
const SPARK = new Color(0xffc977);

const rand = (a: number, b: number) => a + (b - a) * Math.random();

interface Flare {
  pos: Vector3;
  vel: Vector3;
  ageS: number;
}

/** Visual combat effects driven by the session state and game events (spec §15.4). Purely cosmetic. */
export class Effects {
  private readonly scene: Scene;
  private readonly smoke = new ParticleSystem(SMOKE_CAPACITY, false);
  private readonly fire = new ParticleSystem(FIRE_CAPACITY, true);
  private readonly tracers = new Tracers();
  private readonly missileModels: MissileModels;
  private readonly flares: Flare[] = [];
  private readonly trailFrom = new Map<number, Vector3>();
  private damageTimer = 0;
  private readonly tmp = new Vector3();
  private readonly dir = new Vector3();
  private readonly tail = new Vector3();
  private readonly zero = new Vector3();

  constructor(scene: Scene) {
    this.scene = scene;
    this.missileModels = new MissileModels(scene);
    scene.add(this.smoke.points, this.fire.points, this.tracers.lines, this.tracers.heads);
  }

  onEvent(e: GameEvent, session: GameSession): void {
    if (e.type === 'destroyed') {
      const v = session.view(e.aircraftId);
      if (v) this.explosion(v.position, v.flight.vel, 1);
    } else if (e.type === 'missileDetonated') {
      this.explosion(this.tmp.set(e.x, e.y, e.z), this.zero, e.nearAircraft ? 0.6 : 0.45);
    } else if (e.type === 'countermeasures') {
      const v = session.view(e.aircraftId);
      if (v) this.releaseFlares(v);
    } else if (e.type === 'hit' && e.weapon === 'cannon') {
      const v = session.view(e.aircraftId);
      if (v) this.sparks(v.position, 8);
    }
  }

  /** `firstPerson`: the camera sits in the local cockpit, so its own muzzle flash would fill the screen. */
  update(dt: number, session: GameSession, frame: ParticleFrame, firstPerson: boolean): void {
    if (dt > 0) {
      for (const m of session.missiles()) this.missileTrail(m);
      for (const id of this.trailFrom.keys()) if (!this.hasMissile(session, id)) this.trailFrom.delete(id);
      this.updateFlares(dt);
      this.damageTimer += dt;
      const emitDamage = this.damageTimer >= DAMAGE_SMOKE_INTERVAL_S;
      if (emitDamage) this.damageTimer = 0;
      for (const v of session.views()) {
        if (!v.alive) continue;
        if (emitDamage) this.damageSmoke(v);
        if (v.firingCannon && !(firstPerson && v.isLocal)) this.muzzleFlash(v);
      }
    }
    this.missileModels.update(session.missiles());
    this.tracers.update(session.projectiles(), frame);
    this.smoke.update(dt, frame);
    this.fire.update(dt, frame);
  }

  dispose(): void {
    this.scene.remove(this.smoke.points, this.fire.points, this.tracers.lines, this.tracers.heads);
    this.smoke.dispose();
    this.fire.dispose();
    this.tracers.dispose();
    this.missileModels.dispose();
  }

  private hasMissile(session: GameSession, id: number): boolean {
    for (const m of session.missiles()) if (m.id === id) return true;
    return false;
  }

  private explosion(at: Vector3, vel: Vector3, scale: number): void {
    const burst = (n: number, fn: () => void) => {
      for (let i = 0; i < Math.round(n * scale); i++) fn();
    };
    burst(36, () => {
      this.randomDir(this.dir).multiplyScalar(rand(20, 70) * scale);
      this.fire.spawn({
        x: at.x + rand(-3, 3) * scale,
        y: at.y + rand(-3, 3) * scale,
        z: at.z + rand(-3, 3) * scale,
        vx: vel.x * 0.3 + this.dir.x,
        vy: vel.y * 0.3 + this.dir.y,
        vz: vel.z * 0.3 + this.dir.z,
        lifeS: rand(0.5, 1.3),
        size0: rand(6, 10) * scale,
        size1: rand(18, 30) * scale,
        color: FIRE[Math.floor(Math.random() * FIRE.length)],
        alpha: 1,
        lift: 2,
        drag: 1.5,
      });
    });
    burst(22, () => {
      this.randomDir(this.dir).multiplyScalar(rand(8, 25) * scale);
      this.smoke.spawn({
        x: at.x,
        y: at.y,
        z: at.z,
        vx: vel.x * 0.2 + this.dir.x,
        vy: vel.y * 0.2 + this.dir.y,
        vz: vel.z * 0.2 + this.dir.z,
        lifeS: rand(3, 6),
        size0: 10 * scale,
        size1: rand(35, 55) * scale,
        color: DARK_SMOKE,
        alpha: 0.85,
        lift: 3,
        drag: 0.8,
      });
    });
    this.sparks(at, 16 * scale);
  }

  private sparks(at: Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      this.randomDir(this.dir).multiplyScalar(rand(60, 160));
      this.fire.spawn({ x: at.x, y: at.y, z: at.z, vx: this.dir.x, vy: this.dir.y, vz: this.dir.z, lifeS: rand(0.3, 0.8), size0: 1.5, size1: 0.5, color: SPARK, alpha: 1, lift: -9.8, drag: 0.5 });
    }
  }

  private releaseFlares(v: AircraftView): void {
    this.tailOf(v, this.tail);
    const right = this.tmp.set(1, 0, 0).applyQuaternion(v.quaternion);
    for (let i = 0; i < FLARES_PER_SALVO; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const vel = v.flight.vel.clone().multiplyScalar(0.8).addScaledVector(right, side * rand(15, 30));
      vel.y -= rand(5, 15);
      this.flares.push({ pos: this.tail.clone(), vel, ageS: 0 });
    }
  }

  private updateFlares(dt: number): void {
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.ageS += dt;
      if (f.ageS >= FLARE_BURN_S) {
        this.flares.splice(i, 1);
        continue;
      }
      f.vel.multiplyScalar(Math.max(0, 1 - 0.6 * dt));
      f.vel.y -= 9.8 * dt;
      f.pos.addScaledVector(f.vel, dt);
      this.fire.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vx: 0, vy: 0, vz: 0, lifeS: 0.12, size0: 6, size1: 3, color: FLARE, alpha: 1 });
      this.smoke.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vx: 0, vy: 0, vz: 0, lifeS: 2.5, size0: 2, size1: 9, color: TRAIL_SMOKE, alpha: 0.5, lift: 0.5 });
    }
  }

  private missileTrail(m: MissileView): void {
    if (m.velocity.lengthSq() < 1) return;
    this.dir.copy(m.velocity).normalize();
    this.tail.copy(m.position).addScaledVector(this.dir, -1.5);
    let from = this.trailFrom.get(m.id);
    if (!from) {
      from = this.tail.clone();
      this.trailFrom.set(m.id, from);
    }
    if (!m.motorBurning) {
      from.copy(this.tail);
      return;
    }
    this.fire.spawn({ x: this.tail.x, y: this.tail.y, z: this.tail.z, vx: 0, vy: 0, vz: 0, lifeS: 0.06, size0: 3.5, size1: 2, color: MOTOR, alpha: 1 });
    const gap = from.distanceTo(this.tail);
    const puffs = Math.floor(gap / TRAIL_SPACING_M);
    for (let i = 1; i <= puffs; i++) {
      this.tmp.lerpVectors(from, this.tail, (i * TRAIL_SPACING_M) / gap);
      this.smoke.spawn({ x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(-1, 1), lifeS: rand(2.5, 4), size0: 1.5, size1: rand(8, 12), color: TRAIL_SMOKE, alpha: 0.55, lift: 1 });
    }
    if (puffs > 0) from.lerpVectors(from, this.tail, (puffs * TRAIL_SPACING_M) / gap);
  }

  private damageSmoke(v: AircraftView): void {
    const state = damageState(v.hp, v.config.damage.hitPoints);
    if (state !== 'damaged' && state !== 'critical') return;
    this.tailOf(v, this.tail);
    const critical = state === 'critical';
    this.smoke.spawn({
      x: this.tail.x,
      y: this.tail.y,
      z: this.tail.z,
      vx: v.flight.vel.x * 0.1,
      vy: v.flight.vel.y * 0.1,
      vz: v.flight.vel.z * 0.1,
      lifeS: critical ? 4 : 3,
      size0: critical ? 3 : 2,
      size1: critical ? 18 : 14,
      color: critical ? DARK_SMOKE : GREY_SMOKE,
      alpha: 0.7,
      lift: 1.5,
    });
    if (critical) {
      this.fire.spawn({ x: this.tail.x, y: this.tail.y, z: this.tail.z, vx: 0, vy: 0, vz: 0, lifeS: 0.25, size0: 3, size1: 1, color: FIRE[1], alpha: 1 });
    }
  }

  private muzzleFlash(v: AircraftView): void {
    this.dir.set(0, 0, -1).applyQuaternion(v.quaternion);
    this.tmp.copy(v.position).addScaledVector(this.dir, v.config.visual.lengthM / 2 + 1);
    this.fire.spawn({ x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, vx: 0, vy: 0, vz: 0, lifeS: 0.04, size0: 2.2, size1: 1.2, color: FIRE[0], alpha: 1 });
  }

  private tailOf(v: AircraftView, out: Vector3): Vector3 {
    this.dir.set(0, 0, 1).applyQuaternion(v.quaternion);
    return out.copy(v.position).addScaledVector(this.dir, v.config.visual.lengthM / 2 + 1);
  }

  private randomDir(out: Vector3): Vector3 {
    const z = rand(-1, 1);
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    return out.set(r * Math.cos(a), z, r * Math.sin(a));
  }
}
