import { clamp } from '../math/units.ts';

export type WeaponSelect = 'srm' | 'mrm';

/** Everything a pilot (human or bot) can command in one simulation tick. */
export interface ControlInput {
  /** -1..1, +1 = pull (nose up) */
  pitch: number;
  /** -1..1, +1 = roll right */
  roll: number;
  /** -1..1, +1 = nose right */
  yaw: number;
  /** 0..1, > 0.9 = afterburner */
  throttle: number;
  airbrake: boolean;
  fireCannon: boolean;
  fireMissile: boolean;
  countermeasures: boolean;
  cycleTarget: boolean;
  weapon: WeaponSelect;
  /** true while the pilot is looking around (padlock/free look): the IR seeker follows the head */
  helmetSight: boolean;
  /** head yaw relative to the nose, radians (-PI..PI), + = right */
  lookYaw: number;
  /** head pitch relative to the nose, radians (-PI/2..PI/2), + = up */
  lookPitch: number;
}

export function neutralInput(throttle = 0.7): ControlInput {
  return {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle,
    airbrake: false,
    fireCannon: false,
    fireMissile: false,
    countermeasures: false,
    cycleTarget: false,
    weapon: 'srm',
    helmetSight: false,
    lookYaw: 0,
    lookPitch: 0,
  };
}

const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/** Clamps every field into its legal range; non-finite numbers become 0. Never trust raw input. */
export function sanitizeInput(input: ControlInput, out: ControlInput = neutralInput()): ControlInput {
  out.pitch = clamp(finite(input.pitch), -1, 1);
  out.roll = clamp(finite(input.roll), -1, 1);
  out.yaw = clamp(finite(input.yaw), -1, 1);
  out.throttle = clamp(finite(input.throttle), 0, 1);
  out.airbrake = input.airbrake === true;
  out.fireCannon = input.fireCannon === true;
  out.fireMissile = input.fireMissile === true;
  out.countermeasures = input.countermeasures === true;
  out.cycleTarget = input.cycleTarget === true;
  out.weapon = input.weapon === 'mrm' ? 'mrm' : 'srm';
  out.helmetSight = input.helmetSight === true;
  out.lookYaw = clamp(finite(input.lookYaw), -Math.PI, Math.PI);
  out.lookPitch = clamp(finite(input.lookPitch), -Math.PI / 2, Math.PI / 2);
  return out;
}
