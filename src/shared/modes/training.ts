import { opposingTeam, listAircraft } from '../data/aircraft/registry.ts';
import type { TeamId } from '../data/aircraft/types.ts';
import type { GroundTargetSpec, MapDefinition, SpawnSpec } from '../data/maps/map-definition.ts';
import { headingRad } from '../physics/flight-model.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { GameMode, ModeContext, ModeDirector, ModeStatus, TrainingStepId } from './mode.ts';

/** A ring counts when the jet passes within this distance of its center. */
export const RING_PASS_RADIUS_M = 250;

/** Rings relative to the jet at the start of the lesson: a gentle climbing S-turn. */
const RINGS: readonly { ahead: number; right: number; up: number }[] = [
  { ahead: 3500, right: 0, up: 0 },
  { ahead: 7000, right: 1200, up: 300 },
  { ahead: 10500, right: 0, up: 0 },
];
const GUN_DRONE = { ahead: 1500, up: 100, speedMs: 170, radiusM: 6000 };
const MISSILE_DRONE = { ahead: 4000, up: 200, speedMs: 180, radiusM: 7000 };
const DEFEND_DRONE = { behind: 3000, speedMs: 250, radiusM: 6000 };
const DEFEND_LAUNCH_DELAY_S = 1.5;
/** After the missile is gone, the player must still be flying this long. */
const DEFEND_GRACE_S = 1;
/** A drone this far from the player is lost: the lesson starts again. */
const DRONE_LOST_M = 15000;

const STEPS: readonly TrainingStepId[] = ['fly', 'gun', 'missile', 'defend', 'done'];
const LESSONS = STEPS.length - 1;

/**
 * The guided training flight (spec §24, M1c): fly through rings, shoot a drone with the gun, lock and fire a
 * missile at another, then beat a missile fired at you. The player cannot lose: being shot down restarts the current
 * lesson after the respawn. Finishing the last lesson makes the player's team the winner.
 */
export class TrainingMode implements GameMode {
  readonly id = 'training' as const;
  readonly combatEnabled = true;
  readonly respawnDelayS = 3;
  private stepIndex = 0;
  private playerId: number | null = null;
  private playerTeam: TeamId = 'usa';
  /** the step and the player's spawn the current lesson was set up for */
  private setupStep = -1;
  private setupGen = -1;
  private attempt = 0;
  private rings: { x: number; y: number; z: number }[] = [];
  private ringsPassed = 0;
  private droneId: number | null = null;
  private droneDestroyed = false;
  private launchTick = -1;
  private missileId: number | null = null;
  private missileGoneTick = -1;

  spawnPoint(map: MapDefinition, team: TeamId): SpawnSpec {
    return map.spawns[team];
  }

  groundTargets(): readonly GroundTargetSpec[] {
    return [];
  }

  bombLoad(): number {
    return 0;
  }

  canRespawn(): boolean {
    return true;
  }

  onAircraftDestroyed(_ctx: ModeContext, victim: AircraftEntity): void {
    if (victim.id === this.droneId) this.droneDestroyed = true;
  }

  update(): void {}

  get step(): TrainingStepId {
    return STEPS[this.stepIndex];
  }

  direct(d: ModeDirector): void {
    const player = this.player(d);
    if (!player || !player.alive || this.step === 'done') return;
    if (this.setupStep !== this.stepIndex || this.setupGen !== player.spawnGen) this.setUp(d, player);

    switch (this.step) {
      case 'fly': {
        const ring = this.rings[this.ringsPassed];
        const p = player.flight.pos;
        if (ring && Math.hypot(p.x - ring.x, p.y - ring.y, p.z - ring.z) <= RING_PASS_RADIUS_M) this.ringsPassed++;
        if (this.ringsPassed >= this.rings.length) this.advance(d, player);
        break;
      }
      case 'gun':
      case 'missile': {
        const drone = this.droneId === null ? undefined : d.getAircraft(this.droneId);
        if (this.droneDestroyed) this.advance(d, player);
        else if (!drone || drone.flight.pos.distanceTo(player.flight.pos) > DRONE_LOST_M) this.setUp(d, player);
        break;
      }
      case 'defend': {
        if (this.missileId === null) {
          if (d.tick >= this.launchTick && this.droneId !== null) this.missileId = d.launchMissileAt(this.droneId, player.id);
          break;
        }
        const id = this.missileId;
        const flying = d.missileList().some((m) => m.id === id);
        if (flying) break;
        if (this.missileGoneTick < 0) this.missileGoneTick = d.tick;
        if (d.tick - this.missileGoneTick >= DEFEND_GRACE_S * d.tickRate) this.advance(d, player);
        break;
      }
    }
  }

  status(_ctx?: ModeContext): ModeStatus {
    const step = this.step;
    const ring = step === 'fly' ? (this.rings[this.ringsPassed] ?? null) : null;
    return {
      modeId: this.id,
      label: 'Training',
      scores: null,
      timeLeftS: null,
      winner: step === 'done' ? this.playerTeam : null,
      training: {
        step,
        index: Math.min(this.stepIndex + 1, LESSONS),
        total: LESSONS,
        ring: ring ? { ...ring } : null,
        ringsPassed: this.ringsPassed,
        ringsTotal: RINGS.length,
        droneId: this.droneId,
        attempt: this.attempt,
      },
    };
  }

  /** The human pilot: the first aircraft that is not a bot. */
  private player(d: ModeDirector): AircraftEntity | null {
    if (this.playerId !== null) return d.getAircraft(this.playerId) ?? null;
    for (const a of d.aircraftList()) {
      if (a.isBot) continue;
      this.playerId = a.id;
      this.playerTeam = a.team;
      return a;
    }
    return null;
  }

  private advance(d: ModeDirector, player: AircraftEntity): void {
    this.removeDrone(d);
    this.stepIndex = Math.min(this.stepIndex + 1, STEPS.length - 1);
    if (this.step !== 'done') this.setUp(d, player);
  }

  private removeDrone(d: ModeDirector): void {
    if (this.droneId !== null) d.removeAircraft(this.droneId);
    this.droneId = null;
    this.droneDestroyed = false;
  }

  /** (Re)starts the current lesson around where the player is now. */
  private setUp(d: ModeDirector, player: AircraftEntity): void {
    this.attempt = this.setupStep === this.stepIndex ? this.attempt + 1 : 1;
    this.setupStep = this.stepIndex;
    this.setupGen = player.spawnGen;
    this.removeDrone(d);
    this.missileId = null;
    this.missileGoneTick = -1;
    d.restock(player.id);

    const f = player.flight;
    const h = headingRad(f);
    const fx = Math.sin(h);
    const fz = -Math.cos(h);
    const rx = Math.cos(h);
    const rz = Math.sin(h);
    const at = (ahead: number, right: number, up: number) => ({ x: f.pos.x + fx * ahead + rx * right, y: f.pos.y + up, z: f.pos.z + fz * ahead + rz * right });
    const enemy = opposingTeam(this.playerTeam);
    const [enemyJet] = listAircraft(enemy);
    const drone = (ahead: number, up: number, heading: number, orbit: { radiusM: number; speedMs: number }) => {
      const p = at(ahead, 0, up);
      this.droneId = d.addDrone({ team: enemy, aircraftId: enemyJet.id, callsign: '[BOT] Drone', x: p.x, z: p.z, altitudeM: p.y, headingRad: heading, orbit }).id;
    };

    switch (this.step) {
      case 'fly':
        this.ringsPassed = 0;
        this.rings = RINGS.map((r) => at(r.ahead, r.right, r.up));
        break;
      case 'gun':
        drone(GUN_DRONE.ahead, GUN_DRONE.up, h, GUN_DRONE);
        break;
      case 'missile':
        drone(MISSILE_DRONE.ahead, MISSILE_DRONE.up, h, MISSILE_DRONE);
        break;
      case 'defend':
        // Behind the player and flying the same way, so its missile leaves straight at them.
        drone(-DEFEND_DRONE.behind, 0, h, DEFEND_DRONE);
        this.launchTick = d.tick + Math.round(DEFEND_LAUNCH_DELAY_S * d.tickRate);
        break;
    }
  }
}
