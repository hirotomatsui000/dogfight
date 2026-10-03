import { Quaternion, Vector3 } from 'three';
import { clamp, DEG, smoothstep, wrapAngle } from '../math/units.ts';
import type { FlightState } from '../physics/flight-model.ts';

export interface SteerOutput {
  pitch: number;
  roll: number;
  yaw: number;
}

export interface SteerOptions {
  /** upper bound for the pitch command (0..1), used by bot difficulty */
  maxPull?: number;
}

const K_PITCH = 4;
const K_ROLL = 2.5;
const K_BANK_HOLD = 1.5;
const K_YAW = 3;
/** Fine-aim bank per radian of sideways error (1 deg off -> 8 deg of bank). */
const K_FINE_BANK = 8;
const MAX_FINE_BANK = 45 * DEG;
const NEAR_NOSE = 2 * DEG;
const FAR_FROM_NOSE = 8 * DEG;
/** Stick per rad/s of roll rate: damps the roll so the bank settles without overshooting. */
const K_ROLL_DAMP = 0.45;

const d = new Vector3();
const worldUpBody = new Vector3();
const qInv = new Quaternion();

/**
 * Stick commands that point the nose along `desiredDir` (world space).
 * Far from the nose: roll the target into the lift plane and pull.
 * Near the nose: bank gently toward the sideways error (a rudder-only flat turn is far too slow)
 * and fine-tune with pitch and rudder; with no sideways error this levels the wings.
 */
export function steerToward(
  s: FlightState,
  desiredDir: Vector3,
  opts: SteerOptions = {},
  out: SteerOutput = { pitch: 0, roll: 0, yaw: 0 },
): SteerOutput {
  qInv.copy(s.quat).invert();
  d.copy(desiredDir).normalize().applyQuaternion(qInv);
  // "+ 0" turns -0 into +0 so atan2 never flips to PI for a target exactly abeam.
  const ahead = -d.z + 0;
  const offAngle = Math.acos(clamp(ahead, -1, 1));
  const rollError = Math.atan2(d.x, d.y + 0);
  worldUpBody.set(0, 1, 0).applyQuaternion(qInv);
  const bank = Math.atan2(-worldUpBody.x, worldUpBody.y);
  const w = smoothstep(NEAR_NOSE, FAR_FROM_NOSE, offAngle);
  const lateral = Math.atan2(d.x, ahead);
  const fineBank = clamp(K_FINE_BANK * lateral, -MAX_FINE_BANK, MAX_FINE_BANK);

  // body roll rate, + = rolling right (angVel.z is roll left)
  const rollRate = -s.angVel.z;
  const roll = w * K_ROLL * rollError + (1 - w) * K_BANK_HOLD * (fineBank - bank) - K_ROLL_DAMP * rollRate;
  let pitch = K_PITCH * Math.atan2(d.y, ahead);
  if (w > 0.5) pitch = Math.max(pitch, -0.3);

  out.pitch = clamp(pitch, -1, opts.maxPull ?? 1);
  out.roll = clamp(roll, -1, 1);
  out.yaw = clamp(K_YAW * lateral * (1 - w), -1, 1);
  return out;
}

export interface LevelSteerOptions {
  /** the steepest bank the turn may use */
  maxBankRad: number;
  /** the airframe's load-factor limits, to turn a wanted load factor into a pitch command */
  gMax: number;
  gMin: number;
}

/** Bank per radian of heading error, up to the limit. */
const K_LEVEL_BANK = 1;
/** Extra load factor per radian of flight-path error. */
const K_LEVEL_GAMMA = 5;
/** Banked further than this, the wings come level before anything is pulled. */
const LEVEL_PULL_BANK = 75 * DEG;

/**
 * Stick commands for a heavy aircraft (the Sentinel, revision 19): a bank-limited turn toward `headingRad` (0 =
 * north, clockwise) while holding the flight-path angle `climbRad`. Unlike `steerToward` it never rolls a target into
 * the lift plane and pulls: an airframe that pitches at a few degrees a second spirals into the ground that way.
 */
export function steerLevel(s: FlightState, headingRad: number, climbRad: number, o: LevelSteerOptions, out: SteerOutput): SteerOutput {
  qInv.copy(s.quat).invert();
  worldUpBody.set(0, 1, 0).applyQuaternion(qInv);
  const bank = Math.atan2(-worldUpBody.x, worldUpBody.y);
  const speed = Math.max(1, s.vel.length());
  const heading = Math.atan2(s.vel.x, -s.vel.z);
  const targetBank = clamp(K_LEVEL_BANK * wrapAngle(headingRad - heading), -o.maxBankRad, o.maxBankRad);
  const rollRate = -s.angVel.z;
  out.roll = clamp(K_BANK_HOLD * (targetBank - bank) - K_ROLL_DAMP * rollRate, -1, 1);
  out.yaw = 0;
  if (Math.abs(bank) > LEVEL_PULL_BANK) {
    out.pitch = 0;
    return out;
  }
  const gamma = Math.asin(clamp(s.vel.y / speed, -1, 1));
  // A level turn needs 1 / cos(bank) g; the pitch law's neutral stick gives the up-component of the lift direction.
  const nWant = 1 / Math.cos(bank) + K_LEVEL_GAMMA * (climbRad - gamma);
  const nTrim = Math.cos(bank) * Math.cos(gamma);
  const pitch = nWant >= nTrim ? (nWant - nTrim) / Math.max(0.1, o.gMax - nTrim) : -(nTrim - nWant) / Math.max(0.1, nTrim - o.gMin);
  out.pitch = clamp(pitch, -1, 1);
  return out;
}
