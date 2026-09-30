import { Euler, Matrix4, type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { approach, clamp, DEG } from '../../shared/math/units.ts';

export interface CameraTarget {
  position: Vector3;
  quaternion: Quaternion;
  gLoad: number;
  mach: number;
  throttle: number;
  /** look-around direction relative to the view (C / right mouse) */
  lookYaw: number;
  lookPitch: number;
}

const FOV = 70;
const CHASE_DISTANCE = 30;
const CHASE_HEIGHT = 7;
const CHASE_LOOK_AHEAD = 60;
const CHASE_TAU = 0.15;
const TRAUMA_DECAY_PER_S = 1.5;
const SHAKE_MAX_ANGLE = 1.2 * DEG;
const SHAKE_MAX_ROLL = 1.5 * DEG;

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

const WORLD_UP = new Vector3(0, 1, 0);

/** The game's only camera: third person, behind and above the jet (spec §15.1). */
export class CameraRig {
  reduceMotion = false;
  private readonly camera: PerspectiveCamera;
  private trauma = 0;
  private time = 0;
  private readonly offset = new Vector3();
  private offsetReady = false;
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpUp = new Vector3();
  private readonly tmpQ = new Quaternion();
  private readonly tmpM = new Matrix4();
  private readonly tmpE = new Euler(0, 0, 0, 'YXZ');

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** The next update starts right behind the target (after a respawn) instead of easing over. */
  reset(): void {
    this.offsetReady = false;
  }

  /** `aimDirection`: the mouse-aim direction to look along (horizon level); null follows the jet's nose and roll. */
  update(dt: number, target: CameraTarget | null, aimDirection: Vector3 | null): void {
    if (!target) return;
    this.time += dt;
    const dir = this.tmpA;
    if (aimDirection) dir.copy(aimDirection).normalize();
    else dir.set(0, 0, -1).applyQuaternion(target.quaternion);
    const up = aimDirection ? this.tmpUp.copy(WORLD_UP) : this.tmpUp.set(0, 1, 0).applyQuaternion(target.quaternion);
    if (target.lookYaw !== 0 || target.lookPitch !== 0) {
      dir.applyAxisAngle(up, -target.lookYaw);
      const side = this.tmpB.crossVectors(dir, up).normalize();
      dir.applyAxisAngle(side, target.lookPitch);
    }
    const desired = this.tmpB.copy(dir).multiplyScalar(-CHASE_DISTANCE).addScaledVector(up, CHASE_HEIGHT);
    if (!this.offsetReady) {
      this.offset.copy(desired);
      this.offsetReady = true;
    } else {
      this.offset.x = approach(this.offset.x, desired.x, dt, CHASE_TAU);
      this.offset.y = approach(this.offset.y, desired.y, dt, CHASE_TAU);
      this.offset.z = approach(this.offset.z, desired.z, dt, CHASE_TAU);
    }
    this.camera.position.copy(target.position).add(this.offset);
    const lookAt = this.tmpB.copy(target.position).addScaledVector(dir, CHASE_LOOK_AHEAD);
    this.tmpM.lookAt(this.camera.position, lookAt, up);
    this.camera.quaternion.setFromRotationMatrix(this.tmpM);

    this.trauma = Math.max(decayTrauma(this.trauma, dt), sustainedTrauma(target.gLoad, target.mach, target.throttle));
    if (this.trauma > 0) this.applyShake();
    if (this.camera.fov !== FOV) {
      this.camera.fov = FOV;
      this.camera.updateProjectionMatrix();
    }
  }

  private applyShake(): void {
    const amp = this.trauma * this.trauma * (this.reduceMotion ? 0.2 : 1);
    const t = this.time;
    const n = (a: number, b: number, seed: number) => 0.6 * Math.sin(t * a + seed) + 0.4 * Math.sin(t * b + seed * 2.3);
    this.tmpE.set(n(23, 37, 1) * SHAKE_MAX_ANGLE * amp, n(29, 41, 2) * SHAKE_MAX_ANGLE * amp, n(31, 43, 3) * SHAKE_MAX_ROLL * amp, 'YXZ');
    this.camera.quaternion.multiply(this.tmpQ.setFromEuler(this.tmpE));
  }
}
