import { Euler, Matrix4, type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { AircraftVisual } from '../../shared/data/aircraft/types.ts';
import { approach, clamp, DEG, smoothstep } from '../../shared/math/units.ts';

export type CameraMode = 'hud' | 'chase' | 'free';

export interface CameraPose {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
}

export interface CameraTarget {
  position: Vector3;
  quaternion: Quaternion;
  gLoad: number;
  mach: number;
  throttle: number;
  /** pilot eye in body coordinates */
  eyeOffset: Vector3;
  /** head direction relative to the nose (free look / padlock) */
  lookYaw: number;
  lookPitch: number;
}

export interface FreeCamInput {
  forward: number;
  right: number;
  up: number;
  fast: boolean;
  /** radians, + = turn right */
  yawDelta: number;
  /** radians, + = look up */
  pitchDelta: number;
}

export const NO_FREE_INPUT: Readonly<FreeCamInput> = { forward: 0, right: 0, up: 0, fast: false, yawDelta: 0, pitchDelta: 0 };

const MODES: readonly CameraMode[] = ['hud', 'chase', 'free'];
const FOV: Record<CameraMode, number> = { hud: 75, chase: 70, free: 70 };
const TRANSITION_S = 0.35;
const CHASE_DISTANCE = 30;
const CHASE_HEIGHT = 7;
const CHASE_LOOK_AHEAD = 60;
const CHASE_TAU = 0.15;
const FREE_SPEED = 250;
const FREE_FAST_MULTIPLIER = 5;
const TRAUMA_DECAY_PER_S = 1.5;
const SHAKE_MAX_ANGLE = 1.2 * DEG;
const SHAKE_MAX_ROLL = 1.5 * DEG;

export const createPose = (): CameraPose => ({ position: new Vector3(), quaternion: new Quaternion(), fov: 70 });

export function blendPose(from: CameraPose, to: CameraPose, t: number, out: CameraPose): CameraPose {
  const s = smoothstep(0, 1, t);
  out.position.lerpVectors(from.position, to.position, s);
  out.quaternion.slerpQuaternions(from.quaternion, to.quaternion, s);
  out.fov = from.fov + (to.fov - from.fov) * s;
  return out;
}

/** Continuous shake sources: high G, the transonic buffet band and afterburner rumble. */
export function sustainedTrauma(gLoad: number, mach: number, throttle: number): number {
  const g = clamp((Math.abs(gLoad) - 6) / 3, 0, 1) * 0.5;
  const transonic = mach > 0.95 && mach < 1.05 ? 0.25 : 0;
  const afterburner = throttle > 0.9 ? 0.08 : 0;
  return Math.max(g, transonic, afterburner);
}

export function decayTrauma(trauma: number, dt: number): number {
  return Math.max(0, trauma - TRAUMA_DECAY_PER_S * dt);
}

export function pilotEyeOffset(v: AircraftVisual, out: Vector3 = new Vector3()): Vector3 {
  return out.set(0, v.fuselageRadiusM * 0.95 + 0.25, -v.lengthM / 2 + v.lengthM * v.noseLengthFraction * 1.1);
}

const WORLD_UP = new Vector3(0, 1, 0);

export class CameraRig {
  mode: CameraMode = 'hud';
  reduceMotion = false;
  private readonly camera: PerspectiveCamera;
  private readonly desired = createPose();
  private readonly from = createPose();
  private readonly blended = createPose();
  private transitionT = 1;
  private trauma = 0;
  private time = 0;
  private readonly chaseOffset = new Vector3();
  private chaseReady = false;
  private readonly freePos = new Vector3();
  private freeYaw = 0;
  private freePitch = 0;
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpUp = new Vector3();
  private readonly tmpQ = new Quaternion();
  private readonly tmpM = new Matrix4();
  private readonly tmpE = new Euler(0, 0, 0, 'YXZ');

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.from.position.copy(this.camera.position);
    this.from.quaternion.copy(this.camera.quaternion);
    this.from.fov = this.camera.fov;
    this.transitionT = 0;
    if (mode === 'free') {
      this.freePos.copy(this.camera.position);
      this.tmpE.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.freeYaw = this.tmpE.y;
      this.freePitch = this.tmpE.x;
    }
    if (mode === 'chase') this.chaseReady = false;
    this.mode = mode;
  }

  cycle(): CameraMode {
    this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]);
    return this.mode;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  update(dt: number, target: CameraTarget | null, aimDirection: Vector3 | null, free: Readonly<FreeCamInput>): void {
    this.time += dt;
    if (this.mode === 'free' || !target) this.computeFree(dt, free);
    else if (this.mode === 'hud') this.computeHud(target);
    else this.computeChase(dt, target, aimDirection);

    const sustained = target ? sustainedTrauma(target.gLoad, target.mach, target.throttle) : 0;
    this.trauma = Math.max(decayTrauma(this.trauma, dt), sustained);

    this.transitionT = Math.min(1, this.transitionT + dt / TRANSITION_S);
    const pose = this.transitionT < 1 ? blendPose(this.from, this.desired, this.transitionT, this.blended) : this.desired;
    this.camera.position.copy(pose.position);
    this.camera.quaternion.copy(pose.quaternion);
    if (this.mode !== 'free' && this.trauma > 0) this.applyShake();
    if (this.camera.fov !== pose.fov) {
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private computeHud(t: CameraTarget): void {
    this.desired.position.copy(t.eyeOffset).applyQuaternion(t.quaternion).add(t.position);
    this.tmpE.set(t.lookPitch, -t.lookYaw, 0, 'YXZ');
    this.desired.quaternion.copy(t.quaternion).multiply(this.tmpQ.setFromEuler(this.tmpE));
    this.desired.fov = FOV.hud;
  }

  private computeChase(dt: number, t: CameraTarget, aim: Vector3 | null): void {
    const dir = this.tmpA;
    if (aim) dir.copy(aim).normalize();
    else dir.set(0, 0, -1).applyQuaternion(t.quaternion);
    const up = aim ? this.tmpUp.copy(WORLD_UP) : this.tmpUp.set(0, 1, 0).applyQuaternion(t.quaternion);
    if (t.lookYaw !== 0 || t.lookPitch !== 0) {
      dir.applyAxisAngle(up, -t.lookYaw);
      const right = this.tmpB.crossVectors(dir, up).normalize();
      dir.applyAxisAngle(right, t.lookPitch);
    }
    const desiredOffset = this.tmpB.copy(dir).multiplyScalar(-CHASE_DISTANCE).addScaledVector(up, CHASE_HEIGHT);
    if (!this.chaseReady) {
      this.chaseOffset.copy(desiredOffset);
      this.chaseReady = true;
    } else {
      this.chaseOffset.x = approach(this.chaseOffset.x, desiredOffset.x, dt, CHASE_TAU);
      this.chaseOffset.y = approach(this.chaseOffset.y, desiredOffset.y, dt, CHASE_TAU);
      this.chaseOffset.z = approach(this.chaseOffset.z, desiredOffset.z, dt, CHASE_TAU);
    }
    this.desired.position.copy(t.position).add(this.chaseOffset);
    const lookAt = this.tmpB.copy(t.position).addScaledVector(dir, CHASE_LOOK_AHEAD);
    this.tmpM.lookAt(this.desired.position, lookAt, up);
    this.desired.quaternion.setFromRotationMatrix(this.tmpM);
    this.desired.fov = FOV.chase;
  }

  private computeFree(dt: number, f: Readonly<FreeCamInput>): void {
    this.freeYaw -= f.yawDelta;
    this.freePitch = clamp(this.freePitch + f.pitchDelta, -89 * DEG, 89 * DEG);
    this.tmpE.set(this.freePitch, this.freeYaw, 0, 'YXZ');
    this.desired.quaternion.setFromEuler(this.tmpE);
    const speed = FREE_SPEED * (f.fast ? FREE_FAST_MULTIPLIER : 1) * dt;
    const fwd = this.tmpA.set(0, 0, -1).applyQuaternion(this.desired.quaternion);
    const right = this.tmpB.set(1, 0, 0).applyQuaternion(this.desired.quaternion);
    this.freePos.addScaledVector(fwd, f.forward * speed).addScaledVector(right, f.right * speed);
    this.freePos.y += f.up * speed;
    this.desired.position.copy(this.freePos);
    this.desired.fov = FOV.free;
  }

  private applyShake(): void {
    const amp = this.trauma * this.trauma * (this.reduceMotion ? 0.2 : 1);
    const t = this.time;
    const n = (a: number, b: number, seed: number) => 0.6 * Math.sin(t * a + seed) + 0.4 * Math.sin(t * b + seed * 2.3);
    this.tmpE.set(n(23, 37, 1) * SHAKE_MAX_ANGLE * amp, n(29, 41, 2) * SHAKE_MAX_ANGLE * amp, n(31, 43, 3) * SHAKE_MAX_ROLL * amp, 'YXZ');
    this.camera.quaternion.multiply(this.tmpQ.setFromEuler(this.tmpE));
  }
}
