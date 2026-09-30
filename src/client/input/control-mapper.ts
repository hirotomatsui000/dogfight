import { Vector3 } from 'three';
import { steerToward, type SteerOutput } from '../../shared/ai/steering.ts';
import { approach, clamp, DEG, moveToward } from '../../shared/math/units.ts';
import { type ControlInput, neutralInput, type WeaponSelect } from '../../shared/physics/controls.ts';
import { type FlightState, headingRad } from '../../shared/physics/flight-model.ts';

export interface InputSnapshot {
  /** KeyboardEvent.code values currently held */
  keys: ReadonlySet<string>;
  /** codes pressed since the previous snapshot */
  pressed: ReadonlySet<string>;
  mouseDX: number;
  mouseDY: number;
  /** wheel delta since the previous snapshot, positive = scroll down */
  wheel: number;
  leftButton: boolean;
  rightButton: boolean;
}

export function emptySnapshot(): InputSnapshot {
  return { keys: new Set(), pressed: new Set(), mouseDX: 0, mouseDY: 0, wheel: 0, leftButton: false, rightButton: false };
}

export type ControlMode = 'mouse-aim' | 'direct';

export interface MapperSettings {
  mode: ControlMode;
  /** radians per pixel */
  mouseSensitivity: number;
  invertY: boolean;
}

const DEFAULT_SETTINGS: MapperSettings = { mode: 'mouse-aim', mouseSensitivity: 0.0022, invertY: false };
const AXIS_RAMP_S = 0.15;
const THROTTLE_RATE = 0.6;
const WHEEL_THROTTLE_PER_UNIT = 0.0005;
const AIM_PITCH_LIMIT = 85 * DEG;
const LOOK_YAW_LIMIT = 150 * DEG;
const LOOK_PITCH_LIMIT = 80 * DEG;
const LOOK_RETURN_TAU = 0.12;
const OVERRIDE_THRESHOLD = 0.05;

const anyHeld = (keys: ReadonlySet<string>, ...codes: string[]) => codes.some((c) => keys.has(c));
const axisTarget = (keys: ReadonlySet<string>, pos: string[], neg: string[]) =>
  (anyHeld(keys, ...pos) ? 1 : 0) - (anyHeld(keys, ...neg) ? 1 : 0);

/** Pure mapping from raw input snapshots to pilot commands. Holds throttle, axis ramps, aim and head state. */
export class ControlMapper {
  settings: MapperSettings;
  /** world-space direction the mouse-aim autopilot flies toward */
  readonly aimDirection = new Vector3(0, 0, -1);
  lookYaw = 0;
  lookPitch = 0;
  freeLook = false;
  private aimHeading = 0;
  private aimPitch = 0;
  private throttle = 0.8;
  private weapon: WeaponSelect = 'srm';
  private pitchAxis = 0;
  private rollAxis = 0;
  private yawAxis = 0;
  private readonly out: ControlInput = neutralInput();
  private readonly steer: SteerOutput = { pitch: 0, roll: 0, yaw: 0 };
  private readonly nose = new Vector3();

  constructor(settings: Partial<MapperSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  /** Points the aim along the aircraft's nose (call on spawn). */
  resetAim(flight: FlightState): void {
    this.aimHeading = headingRad(flight);
    this.nose.set(0, 0, -1).applyQuaternion(flight.quat);
    this.aimPitch = clamp(Math.asin(clamp(this.nose.y, -1, 1)), -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT);
    this.updateAimDirection();
    this.throttle = flight.throttle;
  }

  map(snap: InputSnapshot, flight: FlightState | null, dt: number, cameraFree: boolean): ControlInput {
    const keys = snap.keys;
    const out = this.out;

    // Throttle.
    const throttleDir = (anyHeld(keys, 'ShiftLeft', 'ShiftRight') ? 1 : 0) - (keys.has('KeyZ') ? 1 : 0);
    this.throttle = clamp(this.throttle + throttleDir * THROTTLE_RATE * dt - snap.wheel * WHEEL_THROTTLE_PER_UNIT, 0, 1);

    // Keyboard axes with ramping.
    const step = dt / AXIS_RAMP_S;
    this.pitchAxis = moveToward(this.pitchAxis, axisTarget(keys, ['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']), step);
    this.rollAxis = moveToward(this.rollAxis, axisTarget(keys, ['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']), step);
    this.yawAxis = moveToward(this.yawAxis, axisTarget(keys, ['KeyE'], ['KeyQ']), step);

    // Head / free look.
    this.freeLook = !cameraFree && (keys.has('KeyC') || snap.rightButton);
    const ySign = this.settings.invertY ? -1 : 1;
    const sens = this.settings.mouseSensitivity;
    if (this.freeLook) {
      this.lookYaw = clamp(this.lookYaw + snap.mouseDX * sens, -LOOK_YAW_LIMIT, LOOK_YAW_LIMIT);
      this.lookPitch = clamp(this.lookPitch - snap.mouseDY * sens * ySign, -LOOK_PITCH_LIMIT, LOOK_PITCH_LIMIT);
    } else {
      this.lookYaw = approach(this.lookYaw, 0, dt, LOOK_RETURN_TAU);
      this.lookPitch = approach(this.lookPitch, 0, dt, LOOK_RETURN_TAU);
      if (!cameraFree && this.settings.mode === 'mouse-aim') {
        this.aimHeading += snap.mouseDX * sens;
        this.aimPitch = clamp(this.aimPitch - snap.mouseDY * sens * ySign, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT);
        this.updateAimDirection();
      }
    }

    // Stick.
    if (cameraFree) {
      out.pitch = 0;
      out.roll = 0;
      out.yaw = 0;
    } else if (this.settings.mode === 'mouse-aim' && flight) {
      steerToward(flight, this.aimDirection, {}, this.steer);
      out.pitch = Math.abs(this.pitchAxis) > OVERRIDE_THRESHOLD ? this.pitchAxis : this.steer.pitch;
      out.roll = Math.abs(this.rollAxis) > OVERRIDE_THRESHOLD ? this.rollAxis : this.steer.roll;
      out.yaw = Math.abs(this.yawAxis) > OVERRIDE_THRESHOLD ? this.yawAxis : this.steer.yaw;
    } else {
      out.pitch = this.pitchAxis;
      out.roll = this.rollAxis;
      out.yaw = this.yawAxis;
    }

    // Buttons.
    if (snap.pressed.has('Digit1')) this.weapon = 'srm';
    if (snap.pressed.has('Digit2')) this.weapon = 'mrm';
    out.throttle = this.throttle;
    out.airbrake = keys.has('KeyB');
    out.fireCannon = !cameraFree && (keys.has('Space') || snap.leftButton);
    out.fireMissile = !cameraFree && snap.pressed.has('KeyF');
    out.countermeasures = snap.pressed.has('KeyX');
    out.cycleTarget = snap.pressed.has('KeyR');
    out.weapon = this.weapon;
    out.helmetSight = this.freeLook;
    out.lookYaw = this.lookYaw;
    out.lookPitch = this.lookPitch;
    return out;
  }

  private updateAimDirection(): void {
    const cp = Math.cos(this.aimPitch);
    this.aimDirection.set(Math.sin(this.aimHeading) * cp, Math.sin(this.aimPitch), -Math.cos(this.aimHeading) * cp);
  }
}
