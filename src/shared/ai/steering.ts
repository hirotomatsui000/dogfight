import { Quaternion, Vector3 } from 'three';
import { clamp, DEG, smoothstep } from '../math/units.ts';
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
