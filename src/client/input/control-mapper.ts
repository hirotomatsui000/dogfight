import { Vector3 } from 'three';
import { steerToward, type SteerOutput } from '../../shared/ai/steering.ts';
import { approach, clamp, DEG, moveToward } from '../../shared/math/units.ts';
import { type ControlInput, neutralInput, type WeaponSelect } from '../../shared/physics/controls.ts';
import { type FlightState, headingRad } from '../../shared/physics/flight-model.ts';
import { type Bindings, DEFAULT_BINDINGS, type KeyAction } from './bindings.ts';
import type { PadAction, PadFrame } from './gamepad.ts';

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
  bindings: Bindings;
}

/** Mouse radians per pixel at the settings screen's 1× sensitivity. */
export const BASE_MOUSE_SENSITIVITY = 0.0022;
const DEFAULT_SETTINGS: MapperSettings = { mode: 'mouse-aim', mouseSensitivity: BASE_MOUSE_SENSITIVITY, invertY: false, bindings: DEFAULT_BINDINGS };
const AXIS_RAMP_S = 0.15;
const THROTTLE_RATE = 0.6;
const WHEEL_THROTTLE_PER_UNIT = 0.0005;
const AIM_PITCH_LIMIT = 85 * DEG;
const LOOK_YAW_LIMIT = 150 * DEG;
const LOOK_PITCH_LIMIT = 80 * DEG;
const LOOK_RETURN_TAU = 0.12;
const OVERRIDE_THRESHOLD = 0.05;
/** A throttle lever must move this much before it takes over from the keyboard. */
const LEVER_MOVE = 0.01;

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
  private lever: number | null = null;
  private readonly out: ControlInput = neutralInput();
  private readonly steer: SteerOutput = { pitch: 0, roll: 0, yaw: 0 };
  private readonly nose = new Vector3();

  constructor(settings: Partial<MapperSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  /** Points the aim along the aircraft's nose (call on spawn). */
  /** the missile the player has selected (1 / 2, D-pad left / right) */
  get selectedWeapon(): WeaponSelect {
    return this.weapon;
  }

  resetAim(flight: FlightState): void {
    this.aimAlongNose(flight);
    this.throttle = flight.throttle;
  }

  /** Pilot commands for this frame from the keyboard and mouse snapshot, plus a gamepad or flight stick if any. */
  map(snap: InputSnapshot, flight: FlightState | null, dt: number, pad: PadFrame | null = null): ControlInput {
    const keys = snap.keys;
    const out = this.out;
    const held = (a: KeyAction) => this.settings.bindings[a].some((c) => keys.has(c));
    const tapped = (a: KeyAction) => this.settings.bindings[a].some((c) => snap.pressed.has(c));
    const axisTarget = (pos: KeyAction, neg: KeyAction) => (held(pos) ? 1 : 0) - (held(neg) ? 1 : 0);

    // Throttle: keys, wheel and pad triggers move it; a throttle lever sets it once the lever moves.
    const throttleDir = axisTarget('throttleUp', 'throttleDown') + (pad ? pad.throttleRate : 0);
    this.throttle = clamp(this.throttle + throttleDir * THROTTLE_RATE * dt - snap.wheel * WHEEL_THROTTLE_PER_UNIT, 0, 1);
    const lever = pad ? pad.throttle : null;
    if (lever !== null && this.lever !== null && Math.abs(lever - this.lever) > LEVER_MOVE) this.throttle = lever;
    if (lever === null || this.lever === null || Math.abs(lever - this.lever) > LEVER_MOVE) this.lever = lever;

    // Keyboard axes with ramping.
    const step = dt / AXIS_RAMP_S;
    this.pitchAxis = moveToward(this.pitchAxis, axisTarget('pitchUp', 'pitchDown'), step);
    this.rollAxis = moveToward(this.rollAxis, axisTarget('rollRight', 'rollLeft'), step);
    this.yawAxis = moveToward(this.yawAxis, axisTarget('yawRight', 'yawLeft'), step);

    // Head / free look: the pad's right stick, or the look key with the mouse.
    const padLook = pad !== null && (pad.lookX !== 0 || pad.lookY !== 0);
    this.freeLook = padLook || held('look') || snap.rightButton;
    const ySign = this.settings.invertY ? -1 : 1;
    const sens = this.settings.mouseSensitivity;
    if (padLook && pad) {
      this.lookYaw = pad.lookX * LOOK_YAW_LIMIT;
      this.lookPitch = -pad.lookY * LOOK_PITCH_LIMIT;
    } else if (this.freeLook) {
      this.lookYaw = clamp(this.lookYaw + snap.mouseDX * sens, -LOOK_YAW_LIMIT, LOOK_YAW_LIMIT);
      this.lookPitch = clamp(this.lookPitch - snap.mouseDY * sens * ySign, -LOOK_PITCH_LIMIT, LOOK_PITCH_LIMIT);
    } else {
      this.lookYaw = approach(this.lookYaw, 0, dt, LOOK_RETURN_TAU);
      this.lookPitch = approach(this.lookPitch, 0, dt, LOOK_RETURN_TAU);
      if (this.settings.mode === 'mouse-aim') {
        this.aimHeading += snap.mouseDX * sens;
        this.aimPitch = clamp(this.aimPitch - snap.mouseDY * sens * ySign, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT);
        this.updateAimDirection();
      }
    }

    // Stick: a held key wins, then the pad stick, then the mouse-aim autopilot.
    const pick = (key: number, stick: number, auto: number) =>
      Math.abs(key) > OVERRIDE_THRESHOLD ? key : Math.abs(stick) > OVERRIDE_THRESHOLD ? stick : auto;
    const padPitch = pad ? pad.pitch : 0;
    const padRoll = pad ? pad.roll : 0;
    const padYaw = pad ? pad.yaw : 0;
    if (this.settings.mode === 'mouse-aim' && flight) {
      steerToward(flight, this.aimDirection, {}, this.steer);
      out.pitch = pick(this.pitchAxis, padPitch, this.steer.pitch);
      out.roll = pick(this.rollAxis, padRoll, this.steer.roll);
      out.yaw = pick(this.yawAxis, padYaw, this.steer.yaw);
      // A pad pilot never touches the mouse: keep the aim on the nose so letting go of the stick holds the heading.
      if (Math.max(Math.abs(padPitch), Math.abs(padRoll), Math.abs(padYaw)) > OVERRIDE_THRESHOLD) this.aimAlongNose(flight);
    } else {
      out.pitch = pick(this.pitchAxis, padPitch, 0);
      out.roll = pick(this.rollAxis, padRoll, 0);
      out.yaw = pick(this.yawAxis, padYaw, 0);
    }

    // Buttons.
    const padDown = (a: PadAction) => pad !== null && pad.down.has(a);
    const padPressed = (a: PadAction) => pad !== null && pad.pressed.has(a);
    if (tapped('weaponSrm') || padPressed('weaponSrm')) this.weapon = 'srm';
    if (tapped('weaponMrm') || padPressed('weaponMrm')) this.weapon = 'mrm';
    out.throttle = this.throttle;
    out.airbrake = held('airbrake') || padDown('airbrake');
    out.fireCannon = held('cannon') || snap.leftButton || padDown('cannon');
    out.fireMissile = tapped('missile') || padPressed('missile');
    out.countermeasures = tapped('flares') || padPressed('flares');
    out.dropBomb = tapped('bomb') || padPressed('bomb');
    out.cycleTarget = tapped('nextTarget') || padPressed('nextTarget');
    out.weapon = this.weapon;
    out.helmetSight = this.freeLook;
    out.lookYaw = this.lookYaw;
    out.lookPitch = this.lookPitch;
    return out;
  }

  /** Esc always pauses (browsers use it to release the mouse); so do the pause key and the pad's Start. */
  pauseRequested(snap: InputSnapshot, pad: PadFrame | null): boolean {
    return snap.pressed.has('Escape') || this.settings.bindings.pause.some((c) => snap.pressed.has(c)) || (pad !== null && pad.pressed.has('pause'));
  }

  scoresHeld(snap: InputSnapshot, pad: PadFrame | null): boolean {
    return this.settings.bindings.scores.some((c) => snap.keys.has(c)) || (pad !== null && pad.down.has('scores'));
  }

  private aimAlongNose(flight: FlightState): void {
    this.aimHeading = headingRad(flight);
    this.nose.set(0, 0, -1).applyQuaternion(flight.quat);
    this.aimPitch = clamp(Math.asin(clamp(this.nose.y, -1, 1)), -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT);
    this.updateAimDirection();
  }

  private updateAimDirection(): void {
    const cp = Math.cos(this.aimPitch);
    this.aimDirection.set(Math.sin(this.aimHeading) * cp, Math.sin(this.aimPitch), -Math.cos(this.aimHeading) * cp);
  }
}
