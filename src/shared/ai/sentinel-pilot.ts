import { Vector3 } from 'three';
import { clamp, DEG } from '../math/units.ts';
import type { ControlInput } from '../physics/controls.ts';
import { incomingMissileWarning } from '../targeting/warnings.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { BotWorld } from './bot-pilot.ts';
import { type DroneOrbit, DronePilot } from './drone-pilot.ts';
import { steerLevel, type SteerOutput } from './steering.ts';

/** A Sentinel runs from enemy fighters closer than this (spec §14: "fly orbits and flee threats"). */
export const SENTINEL_FLEE_RANGE_M = 18000;
/** Countermeasures go out once a missile is this close in time. */
const COUNTERMEASURES_FROM_S = 3;
/** Running away never takes it farther from the centre of the combat area than this share of the radius. */
const MAX_AREA_SHARE = 0.7;
/** Past that share it leans inward, fully so this much farther out. */
const EDGE_LEAN_SPAN = 0.1;
const MAX_CLIMB = 0.12;
const K_ALTITUDE_PER_M = 1 / 1500;
/** It runs in a gentle, bank-limited turn: a hard roll-and-pull spiralled it into the ground (revision 19). */
const RUN_BANK_RAD = 40 * DEG;

/**
 * Flies a Sentinel (Team Objective, M5): its orbit while the sky is clear; away from the nearest enemy fighter, at full
 * power and its orbit height in a bank-limited turn, while one is near; countermeasures against missiles about to arrive.
 */
export class SentinelPilot {
  private readonly orbiter: DronePilot;
  private readonly steer: SteerOutput = { pitch: 0, roll: 0, yaw: 0 };
  private readonly desired = new Vector3();

  constructor(orbit: DroneOrbit) {
    this.orbiter = new DronePilot(orbit);
  }

  get orbit(): DroneOrbit {
    return this.orbiter.orbit;
  }

  think(world: BotWorld, self: AircraftEntity, out: ControlInput): ControlInput {
    this.orbiter.think(world, self, out);
    const warning = incomingMissileWarning(self, world.missileList());
    out.countermeasures = warning !== null && warning.timeToImpactS <= COUNTERMEASURES_FROM_S;
    const f = self.flight;
    let threat: AircraftEntity | null = null;
    let nearest = SENTINEL_FLEE_RANGE_M;
    for (const a of world.aircraftList()) {
      if (!a.alive || a.team === self.team || a.support) continue;
      const d = Math.hypot(a.flight.pos.x - f.pos.x, a.flight.pos.z - f.pos.z);
      if (d < nearest) {
        nearest = d;
        threat = a;
      }
    }
    if (!threat) return out;
    this.desired.set(f.pos.x - threat.flight.pos.x, 0, f.pos.z - threat.flight.pos.z).normalize();
    // At the edge of its area it runs along the edge instead of out of the area.
    const c = world.combatArea;
    const rx = f.pos.x - c.x;
    const rz = f.pos.z - c.z;
    const r = Math.hypot(rx, rz);
    if (r > MAX_AREA_SHARE * c.radiusM) {
      const outward = (this.desired.x * rx + this.desired.z * rz) / r;
      if (outward > 0) this.desired.x -= (outward * rx) / r;
      if (outward > 0) this.desired.z -= (outward * rz) / r;
      if (this.desired.lengthSq() < 1e-6) this.desired.set(-rz, 0, rx);
      this.desired.normalize();
      // A straight run along the edge drifts outward: lean inward, the more the farther out (revision 19).
      const inward = clamp((r / c.radiusM - MAX_AREA_SHARE) / EDGE_LEAN_SPAN, 0, 1);
      this.desired.x -= (inward * rx) / r;
      this.desired.z -= (inward * rz) / r;
      this.desired.normalize();
    }
    const climb = clamp((this.orbit.altitudeM - f.pos.y) * K_ALTITUDE_PER_M, -MAX_CLIMB, MAX_CLIMB);
    const p = self.config.physics;
    steerLevel(f, Math.atan2(this.desired.x, -this.desired.z), climb, { maxBankRad: RUN_BANK_RAD, gMax: p.gMax, gMin: p.gMin }, this.steer);
    out.pitch = this.steer.pitch;
    out.roll = this.steer.roll;
    out.yaw = this.steer.yaw;
    out.throttle = 0.9;
    out.airbrake = false;
    return out;
  }
}
