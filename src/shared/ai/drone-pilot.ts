import { Vector3 } from 'three';
import { clamp } from '../math/units.ts';
import type { ControlInput } from '../physics/controls.ts';
import type { AircraftEntity } from '../world/entities.ts';
import { steerToward, type SteerOutput } from './steering.ts';

/** A level right-hand orbit around a fixed center (training targets, spec §24). */
export interface DroneOrbit {
  x: number;
  z: number;
  radiusM: number;
  altitudeM: number;
  speedMs: number;
}

/** Fraction of the radius error turned into a heading correction toward the circle. */
const K_RADIAL = 2;
const K_ALTITUDE_PER_M = 1 / 1500;
const MAX_CLIMB = 0.15;
const K_SPEED = 0.02;
const AIRBRAKE_ABOVE_MS = 8;

/**
 * Flies a target drone round a gentle orbit at constant height and speed. It never fires, dodges or uses
 * countermeasures: training targets should be easy to follow.
 */
export class DronePilot {
  readonly orbit: DroneOrbit;
  private readonly steer: SteerOutput = { pitch: 0, roll: 0, yaw: 0 };
  private readonly desired = new Vector3();

  constructor(orbit: DroneOrbit) {
    this.orbit = orbit;
  }

  think(_world: unknown, self: AircraftEntity, out: ControlInput): ControlInput {
    const o = this.orbit;
    const f = self.flight;
    const dx = f.pos.x - o.x;
    const dz = f.pos.z - o.z;
    const r = Math.max(1, Math.hypot(dx, dz));
    const rx = dx / r;
    const rz = dz / r;
    // Right-hand turn: the center stays on the right, so the path runs along (-rz, rx).
    const inward = clamp((K_RADIAL * (r - o.radiusM)) / o.radiusM, -1, 1);
    this.desired.set(-rz - inward * rx, clamp((o.altitudeM - f.pos.y) * K_ALTITUDE_PER_M, -MAX_CLIMB, MAX_CLIMB), rx - inward * rz);
    steerToward(f, this.desired, { maxPull: 0.5 }, this.steer);
    out.pitch = this.steer.pitch;
    out.roll = this.steer.roll;
    out.yaw = this.steer.yaw;
    out.throttle = clamp(0.5 + (o.speedMs - f.airspeed) * K_SPEED, 0, 0.88);
    // A fighter at idle still outruns a slow orbit speed: the airbrake holds it back.
    out.airbrake = f.airspeed > o.speedMs + AIRBRAKE_ABOVE_MS;
    out.fireCannon = false;
    out.fireMissile = false;
    out.countermeasures = false;
    out.dropBomb = false;
    out.cycleTarget = false;
    out.helmetSight = false;
    return out;
  }
}
