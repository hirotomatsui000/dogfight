import { clamp } from '../../shared/math/units.ts';

/** Gamepad and flight-stick buttons the player can use (spec §15.3, M1c). */
export const PAD_ACTIONS = [
  'cannon',
  'missile',
  'flares',
  'nextTarget',
  'bomb',
  'airbrake',
  'pause',
  'scores',
  'rudderLeft',
  'rudderRight',
  'throttleUp',
  'throttleDown',
  'weaponSrm',
  'weaponMrm',
] as const;

export type PadAction = (typeof PAD_ACTIONS)[number];
export type AxisRole = 'roll' | 'pitch' | 'yaw' | 'throttle';
export const AXIS_ROLES: readonly AxisRole[] = ['roll', 'pitch', 'yaw', 'throttle'];

/** The plain data this module needs from a browser `Gamepad`. */
export interface PadState {
  id: string;
  /** "standard" for pads the browser maps to the standard layout; "" for flight sticks and others */
  mapping: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export interface AxisCalibration {
  center: number;
  min: number;
  max: number;
}

/** Axis and button assignments for devices without the standard layout (flight sticks). -1 = unassigned. */
export interface CustomPadProfile {
  axes: Record<AxisRole, number>;
  invert: Record<AxisRole, boolean>;
  buttons: Record<PadAction, number>;
}

export interface PadSettings {
  custom: CustomPadProfile;
  /** per-axis calibration of the custom device, by axis index; empty = raw values */
  calibration: AxisCalibration[];
}

/** One frame of pad input, in ControlInput conventions (pitch +1 = nose up). */
export interface PadFrame {
  active: boolean;
  pitch: number;
  roll: number;
  yaw: number;
  /** absolute throttle from a throttle axis (flight sticks), or null */
  throttle: number | null;
  /** -1..1: how fast to move the throttle (triggers or buttons) */
  throttleRate: number;
  lookX: number;
  lookY: number;
  down: ReadonlySet<PadAction>;
  pressed: ReadonlySet<PadAction>;
}

export const DEAD_ZONE = 0.08;

/**
 * A typical flight stick (X roll, Y pitch, twist rudder, slider throttle; trigger fires the gun). Players reassign
 * anything else in the settings screen.
 */
export const DEFAULT_CUSTOM_PROFILE: CustomPadProfile = {
  axes: { roll: 0, pitch: 1, yaw: 2, throttle: 3 },
  invert: { roll: false, pitch: false, yaw: false, throttle: false },
  buttons: {
    cannon: 0,
    missile: 1,
    flares: 2,
    nextTarget: 3,
    bomb: 4,
    airbrake: 5,
    pause: -1,
    scores: -1,
    rudderLeft: -1,
    rudderRight: -1,
    throttleUp: -1,
    throttleDown: -1,
    weaponSrm: -1,
    weaponMrm: -1,
  },
};

export const DEFAULT_PAD_SETTINGS: PadSettings = { custom: DEFAULT_CUSTOM_PROFILE, calibration: [] };

/** Buttons of the browser's standard layout (https://w3c.github.io/gamepad/#remapping). */
const STANDARD_BUTTONS: Readonly<Record<PadAction, number>> = {
  missile: 0, // A
  flares: 1, // B
  cannon: 2, // X
  nextTarget: 3, // Y
  rudderLeft: 4, // LB
  rudderRight: 5, // RB
  throttleDown: 6, // LT
  throttleUp: 7, // RT
  scores: 8, // Back / View
  pause: 9, // Start / Menu
  airbrake: 12, // D-pad up
  bomb: 13, // D-pad down
  weaponSrm: 14, // D-pad left
  weaponMrm: 15, // D-pad right
};

export function applyDeadZone(v: number, zone = DEAD_ZONE): number {
  const a = Math.abs(v);
  if (!Number.isFinite(v) || a <= zone) return 0;
  return (Math.sign(v) * (Math.min(a, 1) - zone)) / (1 - zone);
}

/** -1..1 from a raw axis value, using the recorded rest position and travel on each side. */
export function calibrated(v: number, c: AxisCalibration): number {
  if (v >= c.center) {
    const span = c.max - c.center;
    return span > 1e-3 ? clamp((v - c.center) / span, 0, 1) : 0;
  }
  const span = c.center - c.min;
  return span > 1e-3 ? clamp((v - c.center) / span, -1, 0) : 0;
}

const NONE: ReadonlySet<PadAction> = new Set();

/** Turns pad states into PadFrames, remembering the previous buttons to report presses once. */
export class GamepadReader {
  private previous = new Set<PadAction>();

  read(state: PadState | null, settings: PadSettings): PadFrame {
    if (!state) {
      this.previous = new Set();
      return { active: false, pitch: 0, roll: 0, yaw: 0, throttle: null, throttleRate: 0, lookX: 0, lookY: 0, down: NONE, pressed: NONE };
    }
    const standard = state.mapping === 'standard';
    const buttons = standard ? STANDARD_BUTTONS : settings.custom.buttons;
    const value = (i: number) => (i >= 0 && i < state.buttons.length ? state.buttons[i].value : 0);
    const down = new Set<PadAction>();
    for (const a of PAD_ACTIONS) {
      const i = buttons[a];
      if (i >= 0 && i < state.buttons.length && (state.buttons[i].pressed || state.buttons[i].value > 0.5)) down.add(a);
    }
    const pressed = new Set<PadAction>();
    for (const a of down) if (!this.previous.has(a)) pressed.add(a);
    this.previous = down;

    const axis = (i: number) => (i >= 0 && i < state.axes.length ? state.axes[i] : 0);
    const rudderButtons = (down.has('rudderRight') ? 1 : 0) - (down.has('rudderLeft') ? 1 : 0);
    if (standard) {
      return {
        active: true,
        roll: applyDeadZone(axis(0)),
        pitch: applyDeadZone(axis(1)),
        yaw: rudderButtons,
        throttle: null,
        throttleRate: value(STANDARD_BUTTONS.throttleUp) - value(STANDARD_BUTTONS.throttleDown),
        lookX: applyDeadZone(axis(2)),
        lookY: applyDeadZone(axis(3)),
        down,
        pressed,
      };
    }
    const p = settings.custom;
    const read = (role: AxisRole): number | null => {
      const i = p.axes[role];
      if (i < 0 || i >= state.axes.length) return null;
      const cal = settings.calibration[i];
      const v = cal ? calibrated(state.axes[i], cal) : clamp(state.axes[i], -1, 1);
      return p.invert[role] ? -v : v;
    };
    const throttleAxis = read('throttle');
    return {
      active: true,
      roll: applyDeadZone(read('roll') ?? 0),
      pitch: applyDeadZone(read('pitch') ?? 0),
      yaw: clamp(applyDeadZone(read('yaw') ?? 0) + rudderButtons, -1, 1),
      // Sliders read -1 pushed fully forward, which is full throttle.
      throttle: throttleAxis === null ? null : clamp((1 - throttleAxis) / 2, 0, 1),
      throttleRate: (down.has('throttleUp') ? 1 : 0) - (down.has('throttleDown') ? 1 : 0),
      lookX: 0,
      lookY: 0,
      down,
      pressed,
    };
  }
}

/** Records each axis's travel while the player moves everything, then its rest position. */
export class CalibrationRecorder {
  private min: number[] = [];
  private max: number[] = [];

  sample(state: PadState): void {
    state.axes.forEach((v, i) => {
      this.min[i] = Math.min(this.min[i] ?? v, v);
      this.max[i] = Math.max(this.max[i] ?? v, v);
    });
  }

  /**
   * Call with the stick and rudder released. Levers (the throttle) have no rest position: their center is the
   * middle of their travel.
   */
  finish(rest: PadState, levers: readonly number[] = []): AxisCalibration[] {
    this.sample(rest);
    return rest.axes.map((v, i) => {
      const min = this.min[i];
      const max = this.max[i];
      return { center: levers.includes(i) ? (min + max) / 2 : v, min, max };
    });
  }
}

/** The first button pressed in `cur` that was up in `prev`, or -1 (for "press a button to assign"). */
export function firstNewButton(prev: PadState, cur: PadState): number {
  for (let i = 0; i < cur.buttons.length; i++) {
    if (cur.buttons[i].pressed && !(prev.buttons[i]?.pressed ?? false)) return i;
  }
  return -1;
}

/** The axis moved furthest from its rest value, if beyond `threshold`; -1 otherwise (for "move an axis to assign"). */
export function mostMovedAxis(rest: PadState, cur: PadState, threshold = 0.5): number {
  let best = -1;
  let bestDelta = threshold;
  cur.axes.forEach((v, i) => {
    const d = Math.abs(v - (rest.axes[i] ?? 0));
    if (d > bestDelta) {
      bestDelta = d;
      best = i;
    }
  });
  return best;
}

/** The first connected pad, as plain data (browser only). */
export function pollGamepad(): PadState | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  for (const g of navigator.getGamepads()) {
    if (!g || !g.connected) continue;
    // Copy: some browsers return live objects that keep changing after this call.
    return { id: g.id, mapping: g.mapping, axes: [...g.axes], buttons: g.buttons.map((b) => ({ pressed: b.pressed, value: b.value })) };
  }
  return null;
}
