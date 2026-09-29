import { Euler, Quaternion, Vector3 } from 'three';
import type { AircraftPhysics } from '../data/aircraft/types.ts';
import { approach, clamp, DEG, G0, moveToward } from '../math/units.ts';
import { dragCoefficient, liftCoefficient, SIDE_FORCE_PER_RAD, thrustNewtons } from './aero.ts';
import { type AirData, atmosphere } from './atmosphere.ts';
import type { ControlInput } from './controls.ts';

export interface FlightState {
  pos: Vector3;
  vel: Vector3;
  /** body -> world rotation */
  quat: Quaternion;
  /** body-frame angular velocity (x = pitch up, y = yaw left, z = roll left), rad/s */
  angVel: Vector3;
  /** actual (spooled) throttle 0..1 */
  throttle: number;
  /** airbrake deployment 0..1 */
  airbrake: number;
  alpha: number;
  beta: number;
  /** load factor felt by the pilot along the body up axis */
  gLoad: number;
  mach: number;
  airspeed: number;
  thrust: number;
}

/** Multipliers applied by the damage model. */
export interface FlightEnv {
  thrustScale: number;
  rollScale: number;
}

export const DEFAULT_FLIGHT_ENV: Readonly<FlightEnv> = { thrustScale: 1, rollScale: 1 };

export interface FlightStateInit {
  position: Vector3;
  /** 0 = north (-z), PI/2 = east (+x) */
  headingRad: number;
  /** flight-path pitch (velocity direction) */
  pitchRad?: number;
  /** nose above the flight path; use `trimAlpha` so a fresh aircraft starts in 1 G level flight */
  alphaRad?: number;
  speed: number;
  throttle?: number;
}

const THROTTLE_TAU = 0.6;
const AIRBRAKE_RATE = 1;
const Q_FULL_AUTHORITY = 5000;
const ALPHA_NEG_LIMIT = -10 * DEG;
const K_ALPHA = 5;
const K_BETA = 3;
const BETA_MAX = 6 * DEG;
const TAU_PITCH = 0.05;
const TAU_YAW = 0.08;
const TAU_ROLL = 0.12;
const MIN_SPEED = 1;

export function createFlightState(init: FlightStateInit): FlightState {
  const pitch = init.pitchRad ?? 0;
  const alpha = init.alphaRad ?? 0;
  const quat = new Quaternion().setFromEuler(new Euler(pitch + alpha, -init.headingRad, 0, 'YXZ'));
  const flightPath = new Quaternion().setFromEuler(new Euler(pitch, -init.headingRad, 0, 'YXZ'));
  const vel = new Vector3(0, 0, -1).applyQuaternion(flightPath).multiplyScalar(init.speed);
  return {
    pos: init.position.clone(),
    vel,
    quat,
    angVel: new Vector3(),
    throttle: init.throttle ?? 0.8,
    airbrake: 0,
    alpha: 0,
    beta: 0,
    gLoad: 1,
    mach: 0,
    airspeed: init.speed,
    thrust: 0,
  };
}

export function copyFlightState(target: FlightState, source: FlightState): FlightState {
  target.pos.copy(source.pos);
  target.vel.copy(source.vel);
  target.quat.copy(source.quat);
  target.angVel.copy(source.angVel);
  target.throttle = source.throttle;
  target.airbrake = source.airbrake;
  target.alpha = source.alpha;
  target.beta = source.beta;
  target.gLoad = source.gLoad;
  target.mach = source.mach;
  target.airspeed = source.airspeed;
  target.thrust = source.thrust;
  return target;
}

const headingTmp = new Vector3();

/** Nose heading in radians, 0..2PI, 0 = north, clockwise positive. */
export function headingRad(s: FlightState): number {
  headingTmp.set(0, 0, -1).applyQuaternion(s.quat);
  const h = Math.atan2(headingTmp.x, -headingTmp.z);
  return h < 0 ? h + 2 * Math.PI : h;
}

// Module-level scratch objects: stepFlight is hot and must not allocate.
const air: AirData = { density: 0, temperature: 0, speedOfSound: 0, sigma: 0 };
const fwd = new Vector3();
const up = new Vector3();
const right = new Vector3();
const vHat = new Vector3();
const liftDir = new Vector3();
const sideDir = new Vector3();
const force = new Vector3();
const acc = new Vector3();
const vBody = new Vector3();
const vBodyHat = new Vector3();
const omegaCmd = new Vector3();
const axis = new Vector3();
const qInv = new Quaternion();
const dq = new Quaternion();

export function stepFlight(
  s: FlightState,
  input: ControlInput,
  p: AircraftPhysics,
  dt: number,
  env: Readonly<FlightEnv> = DEFAULT_FLIGHT_ENV,
): void {
  atmosphere(s.pos.y, air);
  const speed = Math.max(s.vel.length(), MIN_SPEED);
  const qbar = 0.5 * air.density * speed * speed;
  const mach = speed / air.speedOfSound;
  const weight = p.massKg * G0;
  const qS = qbar * p.wingAreaM2;

  s.throttle = approach(s.throttle, clamp(input.throttle, 0, 1), dt, THROTTLE_TAU);
  s.airbrake = moveToward(s.airbrake, input.airbrake ? 1 : 0, AIRBRAKE_RATE * dt);

  // Body axes and air-relative angles.
  fwd.set(0, 0, -1).applyQuaternion(s.quat);
  up.set(0, 1, 0).applyQuaternion(s.quat);
  right.set(1, 0, 0).applyQuaternion(s.quat);
  qInv.copy(s.quat).invert();
  vBody.copy(s.vel).applyQuaternion(qInv);
  const alpha = Math.atan2(-vBody.y, -vBody.z);
  const beta = Math.atan2(vBody.x, -vBody.z);

  if (s.vel.lengthSq() > 1e-6) vHat.copy(s.vel).normalize();
  else vHat.copy(fwd);
  liftDir.crossVectors(right, vHat);
  if (liftDir.lengthSq() < 1e-8) liftDir.copy(up);
  else liftDir.normalize();
  sideDir.crossVectors(vHat, liftDir).normalize();

  // Forces.
  const cl = liftCoefficient(alpha, p);
  const cd = dragCoefficient(mach, cl, alpha, beta, s.airbrake, p);
  const cy = -SIDE_FORCE_PER_RAD * beta;
  const thrust = thrustNewtons(s.throttle, p, air.sigma, mach, env.thrustScale);
  force
    .set(0, 0, 0)
    .addScaledVector(liftDir, qS * cl)
    .addScaledVector(sideDir, qS * cy)
    .addScaledVector(vHat, -qS * cd)
    .addScaledVector(fwd, thrust);
  s.gLoad = force.dot(up) / weight;
  force.y -= weight;
  acc.copy(force).divideScalar(p.massKg);

  // Fly-by-wire rotation.
  const authority = clamp(qbar / Q_FULL_AUTHORITY, 0.05, 1);
  const tvc = p.thrustVectoring * clamp(thrust / p.thrustAbN, 0, 1);
  const pitchYawAuthority = clamp(authority + tvc, 0.05, 1);

  // Pitch: stick -> load factor -> angle-of-attack command -> pitch rate.
  const nTrim = liftDir.y;
  const nCmd = input.pitch >= 0 ? nTrim + input.pitch * (p.gMax - nTrim) : nTrim + input.pitch * (nTrim - p.gMin);
  const clRequired = (nCmd * weight - thrust * Math.sin(alpha)) / Math.max(qS, 1);
  const alphaCmd = clamp(clRequired / p.clAlpha, ALPHA_NEG_LIMIT, p.aoaLimiterDeg * DEG);
  const pitchMax = p.maxPitchRateDegS * DEG * (1 + tvc);
  const pitchCmd = clamp(acc.dot(liftDir) / speed + K_ALPHA * pitchYawAuthority * (alphaCmd - alpha), -pitchMax, pitchMax);

  // Roll about the velocity vector, weaker at high AoA and low dynamic pressure.
  const highAlphaFade = 1 - 0.5 * clamp((Math.abs(alpha) - 15 * DEG) / (15 * DEG), 0, 1);
  const rollCmd = input.roll * p.maxRollRateDegS * DEG * authority * highAlphaFade * env.rollScale;

  // Yaw: keep the nose on the flight path, plus a rudder-commanded sideslip.
  const betaCmd = -input.yaw * BETA_MAX;
  const yawMax = p.maxYawRateDegS * DEG * (1 + tvc);
  const noseRight = clamp(acc.dot(sideDir) / speed + K_BETA * pitchYawAuthority * (beta - betaCmd), -yawMax, yawMax);

  vBodyHat.copy(vBody);
  if (vBodyHat.lengthSq() > 1e-6) vBodyHat.normalize();
  else vBodyHat.set(0, 0, -1);
  omegaCmd.set(pitchCmd, -noseRight, 0).addScaledVector(vBodyHat, rollCmd);

  s.angVel.x = approach(s.angVel.x, omegaCmd.x, dt, TAU_PITCH);
  s.angVel.y = approach(s.angVel.y, omegaCmd.y, dt, TAU_YAW);
  s.angVel.z = approach(s.angVel.z, omegaCmd.z, dt, TAU_ROLL);

  // Integrate (semi-implicit Euler).
  s.vel.addScaledVector(acc, dt);
  s.pos.addScaledVector(s.vel, dt);
  const angle = s.angVel.length() * dt;
  if (angle > 1e-12) {
    axis.copy(s.angVel).normalize();
    dq.setFromAxisAngle(axis, angle);
    s.quat.multiply(dq).normalize();
  }

  s.alpha = alpha;
  s.beta = beta;
  s.mach = mach;
  s.airspeed = speed;
  s.thrust = thrust;
}
