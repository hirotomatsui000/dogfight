import { Quaternion, Vector3 } from 'three';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import type { MapDefinition } from '../../shared/data/maps/map-definition.ts';
import { CANNONS } from '../../shared/data/weapons.ts';
import { damageFlightEnv, damageState } from '../../shared/damage/damage.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import { Rng } from '../../shared/math/rng.ts';
import type { GameMode, ModeStatus } from '../../shared/modes/mode.ts';
import { StrikeMode } from '../../shared/modes/strike.ts';
import { TeamDeathmatchMode } from '../../shared/modes/team-deathmatch.ts';
import { decodeSnapshot, encodeInput, quantizeInput, type Snapshot } from '../../shared/net/codec.ts';
import {
  type OnlineModeId,
  PROTOCOL_VERSION,
  type RosterEntry,
  type ServerJsonMessage,
} from '../../shared/net/protocol.ts';
import { atmosphere } from '../../shared/physics/atmosphere.ts';
import { type ControlInput, neutralInput } from '../../shared/physics/controls.ts';
import { createFlightState, type FlightEnv, type FlightState, stepFlight } from '../../shared/physics/flight-model.ts';
import { createSeeker } from '../../shared/targeting/ir-seeker.ts';
import type { Contact } from '../../shared/targeting/sensors.ts';
import { incomingMissileWarning } from '../../shared/targeting/warnings.ts';
import { advanceProjectile, createProjectile, type Projectile, projectileVelocity } from '../../shared/weapons/cannon.ts';
import type { StoresState } from '../../shared/world/entities.ts';
import type { GameEvent } from '../../shared/world/events.ts';
import { createGroundTarget } from '../../shared/world/ground-targets.ts';
import { BOUNDARY_GRACE_S, DT, TICK_RATE } from '../../shared/world/world.ts';
import { FixedStepper } from './fixed-stepper.ts';
import type { AircraftView, BombView, GameSession, GroundTargetView, MissileView, ProjectileView } from './game-session.ts';
import type { Transport } from './net-transport.ts';

/** Others are drawn this far in the past, so there is almost always a newer snapshot to blend toward (spec §7). */
export const INTERP_DELAY_TICKS = 6;
/** Past the newest snapshot, motion continues along the last velocity for at most this long. */
const MAX_EXTRAPOLATION_TICKS = 12;
/** Prediction errors fade out with this time constant (spec §7: τ = 0.1 s). */
const CORRECTION_TAU_S = 0.1;
/** A correction bigger than this is a teleport: snap instead of blending. */
const SNAP_DISTANCE_M = 60;
const PING_INTERVAL_MS = 2000;
/** The server's clock does not wait for a slow frame: catch up to a quarter second (15 inputs) per frame. */
export const MAX_STEPS_PER_FRAME = 15;
const CLOCK_SAMPLES = 10;
const TARGET_QUEUE = 2;
const MAX_NUDGE = 0.02;
const SAMPLES_KEPT = 40;
const MAX_TRACERS = 600;

export interface HelloOptions {
  room: string;
  callsign: string;
  aircraftId: string;
  mode: OnlineModeId;
}

export interface Welcome {
  room: string;
  you: number;
  modeId: OnlineModeId;
  build: string;
  tick: number;
}

interface Sample {
  tick: number;
  spawnGen: number;
  alive: boolean;
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
}

/** An aircraft as seen over the network: interpolated (others) or predicted (your own). */
class NetAircraft implements AircraftView {
  readonly id: number;
  readonly callsign: string;
  readonly team: TeamId;
  readonly config: AircraftView['config'];
  readonly isLocal: boolean;
  readonly isBot: boolean;
  alive = true;
  hp: number;
  spawnGen = 0;
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  flight: FlightState;
  boundarySecondsLeft: number | null = null;
  kills = 0;
  deaths = 0;
  firingCannon = false;
  stores: StoresState = { cannonRounds: 0, srm: 0, mrm: 0, countermeasures: 0, bombs: 0 };
  readonly bombLoad: number;
  targetId: number | null = null;
  contacts: Contact[] = [];
  seeker = createSeeker();
  incoming: AircraftView['incoming'] = null;
  readonly samples: Sample[] = [];
  /** tracer timing for the cosmetic cannon fire */
  cannonAccumulator = 0;

  constructor(r: RosterEntry, isLocal: boolean, bombLoad: number) {
    this.id = r.id;
    this.callsign = r.callsign;
    this.team = r.team;
    this.config = getAircraft(r.aircraftId);
    this.isLocal = isLocal;
    this.isBot = r.isBot;
    this.hp = this.config.damage.hitPoints;
    this.bombLoad = bombLoad;
    this.flight = createFlightState({ position: new Vector3(), headingRad: 0, speed: 0 });
  }
}

interface MovingView {
  readonly id: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
}

const v3 = (out: Vector3, a: readonly number[]) => out.set(a[0], a[1], a[2]);

/** Cubic Hermite blend of positions with their velocities over `durationS` (spec §7). */
function hermite(p0: Vector3, v0: Vector3, p1: Vector3, v1: Vector3, s: number, durationS: number, out: Vector3): Vector3 {
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return out
    .copy(p0)
    .multiplyScalar(h00)
    .addScaledVector(v0, h10 * durationS)
    .addScaledVector(p1, h01)
    .addScaledVector(v1, h11 * durationS);
}

/**
 * The client side of online play (spec §7, M2): predicts the player's own jet with the shared flight model and
 * reconciles it with the server, draws everyone else 100 ms in the past, and keeps its clock and input rate in step
 * with the server. Implements the same GameSession as single player, so the HUD and renderer do not change.
 */
export class NetworkSession implements GameSession {
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  localId: number;
  readonly room: string;
  readonly serverBuild: string;
  readonly modeId: OnlineModeId;
  /** called once when the connection ends (`clean` = this side closed it) */
  onClosed: ((reason: string, clean: boolean) => void) | null = null;
  closed = false;
  closeReason = '';

  private readonly transport: Transport;
  private readonly now: () => number;
  private readonly mode: GameMode;
  private readonly stepper = new FixedStepper(DT, MAX_STEPS_PER_FRAME);
  private readonly aircraft = new Map<number, NetAircraft>();
  private readonly roster = new Map<number, RosterEntry>();
  private readonly snapshots: Snapshot[] = [];
  private status: ModeStatus;
  private statusTick = 0;
  private pendingEvents: { tick: number; event: GameEvent }[] = [];
  private chatLines: { from: number; index: number }[] = [];
  private matchStarted = false;

  // Prediction.
  private seq = 0;
  private readonly pending: { seq: number; input: ControlInput }[] = [];
  private readonly predicted: FlightState = createFlightState({ position: new Vector3(), headingRad: 0, speed: 0 });
  private predictedValid = false;
  private readonly predictedHistory = new Map<number, Vector3>();
  private readonly offsetPos = new Vector3();
  private readonly offsetQuat = new Quaternion();
  private readonly env: FlightEnv = { thrustScale: 1, rollScale: 1 };
  private readonly stepInput = neutralInput();
  private readonly latched = { cycleTarget: false, countermeasures: false, fireMissile: false, dropBomb: false };
  private localSpawnGen = -1;
  /** last prediction error measured at a snapshot, metres (debug overlay, tests) */
  predictionErrorM = 0;

  // Clock and queue.
  private tickBase: number;
  private msBase: number;
  private readonly clockSamples: { rttMs: number; tick: number; ms: number }[] = [];
  private lastPingMs = -Infinity;
  rttMs = 0;
  queueDepth = 0;
  private nudge = 0;
  /** the newest snapshot not yet reconciled with the own jet */
  private toReconcile: Snapshot | null = null;

  // Views.
  private readonly missileViews = new Map<number, MissileView & { samplesFrom: number }>();
  private readonly bombViews = new Map<number, BombView>();
  private readonly targetViews: GroundTargetView[];
  private readonly tracers: Projectile[] = [];
  private readonly tracerViews: ProjectileView[] = [];
  private nextTracerId = 1;
  private readonly rng = new Rng(7);
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpQ = new Quaternion();
  private readonly prevQuat = new Quaternion();
  private readonly invQuat = new Quaternion();

  /** Opens the session: sends hello and resolves on the server's welcome (rejects on refusal or a closed line). */
  static connect(transport: Transport, hello: HelloOptions, map: MapDefinition, terrain: Terrain, now: () => number = () => performance.now()): Promise<NetworkSession> {
    return new Promise((resolve, reject) => {
      const early: ServerJsonMessage[] = [];
      const binaries: ArrayBuffer[] = [];
      let settled = false;
      transport.onOpen = () => transport.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, ...hello }));
      transport.onClose = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Could not reach the game server.'));
        }
      };
      transport.onMessage = (data) => {
        if (settled) return;
        if (typeof data !== 'string') {
          binaries.push(data);
          return;
        }
        const msg = JSON.parse(data) as ServerJsonMessage;
        if (msg.type === 'reject') {
          settled = true;
          transport.close();
          reject(new Error(msg.reason));
        } else if (msg.type === 'welcome') {
          settled = true;
          const session = new NetworkSession(transport, { room: msg.room, you: msg.you, modeId: msg.modeId, build: msg.build, tick: msg.tick }, map, terrain, now);
          for (const m of early) session.handleJson(m);
          for (const b of binaries) session.handleSnapshot(b);
          resolve(session);
        } else {
          early.push(msg);
        }
      };
    });
  }

  constructor(transport: Transport, welcome: Welcome, map: MapDefinition, terrain: Terrain, now: () => number) {
    this.transport = transport;
    this.map = map;
    this.terrain = terrain;
    this.now = now;
    this.localId = welcome.you;
    this.room = welcome.room;
    this.serverBuild = welcome.build;
    this.modeId = welcome.modeId;
    this.mode = welcome.modeId === 'strike' ? new StrikeMode() : new TeamDeathmatchMode();
    this.status = { modeId: welcome.modeId, label: welcome.modeId === 'strike' ? 'Strike' : 'Team Deathmatch', scores: null, timeLeftS: null, winner: null };
    this.tickBase = welcome.tick;
    this.msBase = now();
    this.targetViews = this.mode.groundTargets(map).map((spec) => {
      const t = createGroundTarget(spec, terrain);
      return { id: t.id, kind: t.kind, label: t.label, position: t.pos.clone(), maxHp: t.maxHp, hp: t.hp, destroyed: false };
    });
    transport.onMessage = (data) => {
      if (typeof data === 'string') this.handleJson(JSON.parse(data) as ServerJsonMessage);
      else this.handleSnapshot(data);
    };
    transport.onClose = (clean) => this.markClosed(clean ? 'Left the room' : 'Connection lost', clean);
    this.ping();
  }

  /** The server tick it is now, by the synced clock (fractional). */
  serverTickNow(): number {
    return this.tickBase + ((this.now() - this.msBase) * TICK_RATE) / 1000;
  }

  /** The tick others are drawn at. */
  renderTick(): number {
    return this.serverTickNow() - INTERP_DELAY_TICKS;
  }

  update(frameDtS: number, input: ControlInput): void {
    if (this.closed) return;
    if (this.now() - this.lastPingMs >= PING_INTERVAL_MS) this.ping();
    const l = this.latched;
    l.cycleTarget ||= input.cycleTarget;
    l.countermeasures ||= input.countermeasures;
    l.fireMissile ||= input.fireMissile;
    l.dropBomb ||= input.dropBomb;
    if (this.toReconcile) {
      this.reconcile(this.toReconcile);
      this.toReconcile = null;
    }
    const me = this.aircraft.get(this.localId);
    this.stepper.advance(frameDtS * (1 + this.nudge), () => {
      Object.assign(this.stepInput, input, l);
      l.cycleTarget = false;
      l.countermeasures = false;
      l.fireMissile = false;
      l.dropBomb = false;
      this.clientTick(me);
    });
    this.decayCorrection(frameDtS);
    this.refreshViews();
  }

  views(): Iterable<AircraftView> {
    return this.aircraft.values();
  }

  localView(): AircraftView | null {
    return this.aircraft.get(this.localId) ?? null;
  }

  view(id: number): AircraftView | null {
    return this.aircraft.get(id) ?? null;
  }

  missiles(): Iterable<MissileView> {
    return this.missileViews.values();
  }

  projectiles(): Iterable<ProjectileView> {
    return this.tracerViews;
  }

  groundTargets(): readonly GroundTargetView[] {
    return this.targetViews;
  }

  bombs(): Iterable<BombView> {
    return this.bombViews.values();
  }

  /** Game events whose moment has come at the render time, so effects line up with what is drawn. */
  drainEvents(): GameEvent[] {
    const due = this.renderTick() + 1;
    const out: GameEvent[] = [];
    const keep: { tick: number; event: GameEvent }[] = [];
    for (const e of this.pendingEvents) {
      // Your own hits, launches and deaths show at once; everything else when it is drawn.
      if (e.tick <= due || this.concernsLocal(e.event)) out.push(e.event);
      else keep.push(e);
    }
    this.pendingEvents = keep;
    return out;
  }

  modeStatus(): ModeStatus {
    const s = this.status;
    if (s.timeLeftS === null || s.winner !== null) return s;
    const elapsed = Math.max(0, (this.serverTickNow() - this.statusTick) / TICK_RATE);
    return { ...s, timeLeftS: Math.max(0, s.timeLeftS - elapsed) };
  }

  /** Quick-chat lines received since the last call. */
  drainChat(): { from: number; index: number }[] {
    const lines = this.chatLines;
    this.chatLines = [];
    return lines;
  }

  sendChat(index: number): void {
    if (!this.closed) this.transport.send(JSON.stringify({ type: 'chat', index }));
  }

  /** True once after the server started a new match in this room (new aircraft ids). */
  consumeMatchStart(): boolean {
    const started = this.matchStarted;
    this.matchStarted = false;
    return started;
  }

  dispose(): void {
    if (!this.closed) {
      this.closed = true;
      this.transport.close();
    }
  }

  private markClosed(reason: string, clean: boolean): void {
    if (this.closed && this.closeReason) return;
    this.closed = true;
    this.closeReason = reason;
    this.onClosed?.(reason, clean);
  }

  private concernsLocal(e: GameEvent): boolean {
    const id = this.localId;
    switch (e.type) {
      case 'hit':
        return e.aircraftId === id || e.attackerId === id;
      case 'destroyed':
        return e.aircraftId === id;
      case 'missileLaunched':
        return e.shooterId === id;
      case 'countermeasures':
        return e.aircraftId === id;
      case 'bombReleased':
        return e.aircraftId === id;
      case 'missileDecoyed':
        return e.targetId === id;
      default:
        return false;
    }
  }

  private ping(): void {
    this.lastPingMs = this.now();
    this.transport.send(JSON.stringify({ type: 'ping', t: this.lastPingMs }));
  }

  /** One 60 Hz client tick: send the input and predict the own jet with it. */
  private clientTick(me: NetAircraft | undefined): void {
    this.seq++;
    const input = quantizeInput(this.stepInput);
    const rttTicks = (this.rttMs * TICK_RATE) / 1000;
    const viewDelay = Math.round(rttTicks / 2 + this.queueDepth + INTERP_DELAY_TICKS);
    this.transport.send(encodeInput(this.seq, input, viewDelay));
    this.pending.push({ seq: this.seq, input });
    if (this.pending.length > 300) this.pending.shift();
    if (me && me.alive && this.predictedValid) {
      damageFlightEnv(damageState(me.hp, me.config.damage.hitPoints), this.env);
      stepFlight(this.predicted, input, me.config.physics, DT, this.env);
      this.predictedHistory.set(this.seq, this.predicted.pos.clone());
      if (this.predictedHistory.size > 300) this.predictedHistory.delete(this.seq - 300);
      this.fireTracers(me, input.fireCannon && me.stores.cannonRounds > 0, this.predicted);
    }
    for (const a of this.aircraft.values()) {
      if (!a.isLocal) this.fireTracers(a, a.alive && a.firingCannon, a.flight);
    }
    this.advanceTracers();
  }

  private fireTracers(a: NetAircraft, firing: boolean, flight: FlightState): void {
    if (!firing) {
      a.cannonAccumulator = 1;
      return;
    }
    const spec = CANNONS[a.config.stores.cannon];
    a.cannonAccumulator += spec.projectilesPerS * DT;
    const density = atmosphere(flight.pos.y).density;
    while (a.cannonAccumulator >= 1) {
      a.cannonAccumulator -= 1;
      if (this.tracers.length >= MAX_TRACERS) this.tracers.shift();
      this.tracers.push(createProjectile(this.nextTracerId++, { id: a.id, team: a.team, flight }, spec, this.rng, density));
    }
  }

  private advanceTracers(): void {
    const list = this.tracers;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      advanceProjectile(p, DT);
      if (p.ageS >= p.lifetimeS || p.pos.y < this.terrain.surfaceAt(p.pos.x, p.pos.z)) list.splice(i, 1);
    }
  }

  private handleJson(msg: ServerJsonMessage): void {
    switch (msg.type) {
      case 'roster':
        this.applyRoster(msg.players);
        break;
      case 'events':
        for (const event of msg.events) this.pendingEvents.push({ tick: msg.tick, event });
        break;
      case 'status':
        this.status = msg.status;
        this.statusTick = msg.tick;
        break;
      case 'matchEnd':
        this.status = msg.status;
        this.statusTick = this.serverTickNow();
        break;
      case 'matchStart':
        this.startNewMatch(msg.you);
        break;
      case 'chat':
        this.chatLines.push({ from: msg.from, index: msg.index });
        break;
      case 'pong':
        this.applyPong(msg.t, msg.tick);
        break;
      case 'shutdown':
        this.markClosed('The server is restarting', false);
        break;
      case 'reject':
        this.markClosed(msg.reason, false);
        break;
      default:
        break;
    }
  }

  private applyPong(sentMs: number, tick: number): void {
    const now = this.now();
    const rtt = Math.max(0, now - sentMs);
    this.clockSamples.push({ rttMs: rtt, tick: tick + (rtt / 2 / 1000) * TICK_RATE, ms: now });
    if (this.clockSamples.length > CLOCK_SAMPLES) this.clockSamples.shift();
    // The fastest round trip of the recent ones carries the least queueing noise (spec §7).
    let best = this.clockSamples[0];
    for (const s of this.clockSamples) if (s.rttMs < best.rttMs) best = s;
    this.rttMs = best.rttMs;
    this.tickBase = best.tick;
    this.msBase = best.ms;
  }

  private applyRoster(players: readonly RosterEntry[]): void {
    const seen = new Set<number>();
    for (const r of players) {
      seen.add(r.id);
      this.roster.set(r.id, r);
      let a = this.aircraft.get(r.id);
      if (!a) {
        a = new NetAircraft(r, r.id === this.localId, this.mode.bombLoad(r.team));
        this.aircraft.set(r.id, a);
      }
      a.kills = r.kills;
      a.deaths = r.deaths;
    }
    for (const id of [...this.aircraft.keys()]) {
      if (!seen.has(id)) {
        this.aircraft.delete(id);
        this.roster.delete(id);
      }
    }
  }

  private startNewMatch(you: number): void {
    this.localId = you;
    this.aircraft.clear();
    this.roster.clear();
    this.snapshots.length = 0;
    this.toReconcile = null;
    this.pending.length = 0;
    this.pendingEvents = [];
    this.predictedValid = false;
    this.localSpawnGen = -1;
    this.offsetPos.set(0, 0, 0);
    this.offsetQuat.identity();
    this.tracers.length = 0;
    this.missileViews.clear();
    this.bombViews.clear();
    for (const t of this.targetViews) {
      t.hp = t.maxHp;
      t.destroyed = false;
    }
    this.matchStarted = true;
  }

  private handleSnapshot(buf: ArrayBuffer): void {
    const snap = decodeSnapshot(buf);
    // The server is never behind its own snapshot: catch the clock up if it fell back.
    if (snap.tick > this.serverTickNow()) {
      this.tickBase = snap.tick;
      this.msBase = this.now();
    }
    this.snapshots.push(snap);
    if (this.snapshots.length > SAMPLES_KEPT) this.snapshots.shift();
    this.queueDepth = snap.queueDepth;
    this.nudge = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, (TARGET_QUEUE - snap.queueDepth) * 0.01));

    for (const s of snap.aircraft) {
      const a = this.aircraft.get(s.id);
      if (!a) continue;
      a.samples.push({ tick: snap.tick, spawnGen: s.spawnGen, alive: s.alive, pos: v3(new Vector3(), s.pos), vel: v3(new Vector3(), s.vel), quat: new Quaternion(s.quat[0], s.quat[1], s.quat[2], s.quat[3]) });
      if (a.samples.length > SAMPLES_KEPT) a.samples.shift();
      a.hp = s.hp;
      a.firingCannon = s.firingCannon;
      a.flight.throttle = s.throttle;
      if (!a.isLocal) {
        a.alive = s.alive;
        a.spawnGen = s.spawnGen;
      }
    }
    snap.targets.forEach((t, i) => {
      const v = this.targetViews[i];
      if (!v) return;
      v.hp = t.hpFraction * v.maxHp;
      v.destroyed = t.destroyed;
    });
    // Replaying the own inputs is the costly part: do it once per frame, for the newest snapshot only.
    this.toReconcile = snap;
  }

  /** Resets the own jet to the server's state for the acknowledged input and replays the inputs after it. */
  private reconcile(snap: Snapshot): void {
    const me = this.aircraft.get(this.localId);
    const own = snap.own;
    const mine = snap.aircraft.find((a) => a.id === this.localId);
    if (!me || !own || !mine) return;
    me.alive = mine.alive;
    me.stores = { cannonRounds: own.cannonRounds, srm: own.srm, mrm: own.mrm, countermeasures: own.countermeasures, bombs: own.bombs };
    me.hp = own.hp;
    me.targetId = own.targetId;
    me.contacts = own.contacts.map((c) => ({ ...c }));
    me.seeker.mode = own.seekerMode;
    me.seeker.targetId = own.seekerTargetId;
    v3(me.seeker.axis, own.seekerAxis);
    me.boundarySecondsLeft = own.outOfBoundsTicks > 0 ? (BOUNDARY_GRACE_S * TICK_RATE - own.outOfBoundsTicks) / TICK_RATE : null;
    while (this.pending.length > 0 && this.pending[0].seq <= snap.ackSeq) this.pending.shift();
    if (!mine.alive) {
      this.predictedValid = false;
      return;
    }

    const before = this.tmpA.copy(this.predicted.pos);
    this.prevQuat.copy(this.predicted.quat);
    const respawned = mine.spawnGen !== this.localSpawnGen || !this.predictedValid;
    const atAck = this.predictedHistory.get(snap.ackSeq);
    const p = this.predicted;
    v3(p.pos, own.pos);
    v3(p.vel, own.vel);
    v3(p.angVel, own.angVel);
    p.quat.set(own.quat[0], own.quat[1], own.quat[2], own.quat[3]).normalize();
    p.throttle = own.throttle;
    p.airbrake = own.airbrake;
    if (atAck) this.predictionErrorM = atAck.distanceTo(p.pos);
    damageFlightEnv(damageState(me.hp, me.config.damage.hitPoints), this.env);
    for (const { seq, input } of this.pending) {
      stepFlight(p, input, me.config.physics, DT, this.env);
      this.predictedHistory.set(seq, p.pos.clone());
    }
    this.predictedValid = true;
    if (respawned) {
      this.localSpawnGen = mine.spawnGen;
      me.spawnGen++;
      this.offsetPos.set(0, 0, 0);
      this.offsetQuat.identity();
      return;
    }
    // Keep what is drawn where it was and let the difference fade (τ = 0.1 s).
    this.offsetPos.add(before.sub(p.pos));
    if (this.offsetPos.length() > SNAP_DISTANCE_M) this.offsetPos.set(0, 0, 0);
    // Drawn = offset · predicted, so the new offset is old offset · old predicted · new predicted⁻¹.
    this.offsetQuat.multiply(this.prevQuat).multiply(this.invQuat.copy(p.quat).invert()).normalize();
  }

  private decayCorrection(dt: number): void {
    const k = Math.exp(-dt / CORRECTION_TAU_S);
    this.offsetPos.multiplyScalar(k);
    this.offsetQuat.slerp(this.tmpQ.identity(), 1 - k);
  }

  private refreshViews(): void {
    const render = this.renderTick();
    const me = this.aircraft.get(this.localId);
    for (const a of this.aircraft.values()) {
      if (a.isLocal && this.predictedValid && a.alive) {
        a.flight = this.predicted;
        a.position.copy(this.predicted.pos).add(this.offsetPos);
        a.quaternion.copy(this.offsetQuat).multiply(this.predicted.quat);
        continue;
      }
      this.interpolate(a, render);
    }
    if (me) me.incoming = me.alive ? incomingMissileWarning({ id: me.id, flight: me.flight }, this.missileSamples()) : null;
    this.refreshOrdnance(render);
    this.refreshTracers();
  }

  private interpolate(a: NetAircraft, render: number): void {
    const list = a.samples;
    if (list.length === 0) return;
    let i = list.length - 1;
    while (i > 0 && list[i].tick > render) i--;
    const s0 = list[i];
    const s1 = list[i + 1];
    const f = a.flight;
    if (s1 && s1.spawnGen === s0.spawnGen && s1.tick > s0.tick && render >= s0.tick) {
      const span = s1.tick - s0.tick;
      const s = Math.min(1, (render - s0.tick) / span);
      hermite(s0.pos, s0.vel, s1.pos, s1.vel, s, span / TICK_RATE, a.position);
      a.quaternion.slerpQuaternions(s0.quat, s1.quat, s);
      f.vel.lerpVectors(s0.vel, s1.vel, s);
    } else {
      const latest = render < s0.tick ? s0 : (s1 ?? s0);
      const ahead = Math.min(Math.max(0, render - latest.tick), MAX_EXTRAPOLATION_TICKS) / TICK_RATE;
      a.position.copy(latest.pos).addScaledVector(latest.vel, ahead);
      a.quaternion.copy(latest.quat);
      f.vel.copy(latest.vel);
    }
    f.pos.copy(a.position);
    f.quat.copy(a.quaternion);
    f.airspeed = f.vel.length();
  }

  private missileSamples(): { id: number; targetId: number | null; pos: Vector3; vel: Vector3 }[] {
    const out: { id: number; targetId: number | null; pos: Vector3; vel: Vector3 }[] = [];
    for (const m of this.missileViews.values()) out.push({ id: m.id, targetId: m.targetId, pos: m.position, vel: m.velocity });
    return out;
  }

  /** Missiles and bombs: drawn at the render time like aircraft, from the snapshots around it. */
  private refreshOrdnance(render: number): void {
    const snaps = this.snapshots;
    if (snaps.length === 0) return;
    let i = snaps.length - 1;
    while (i > 0 && snaps[i].tick > render) i--;
    const s0 = snaps[i];
    const s1 = snaps[i + 1];
    const span = s1 ? s1.tick - s0.tick : 1;
    const s = s1 ? Math.min(1, Math.max(0, (render - s0.tick) / span)) : 0;
    const ahead = s1 ? 0 : Math.min(Math.max(0, render - s0.tick), MAX_EXTRAPOLATION_TICKS) / TICK_RATE;

    const blend = (views: Map<number, MovingView>, now: { id: number; pos: number[]; vel: number[] }[], next: { id: number; pos: number[]; vel: number[] }[] | undefined, make: (id: number) => MovingView) => {
      const nextById = new Map(next?.map((x) => [x.id, x]));
      const seen = new Set<number>();
      for (const m of now) {
        seen.add(m.id);
        let v = views.get(m.id);
        if (!v) {
          v = make(m.id);
          views.set(m.id, v);
        }
        const n = nextById.get(m.id);
        v3(this.tmpA, m.pos);
        v3(v.velocity, m.vel);
        if (n) {
          v3(this.tmpB, n.pos);
          hermite(this.tmpA, v.velocity, this.tmpB, v3(new Vector3(), n.vel), s, span / TICK_RATE, v.position);
        } else {
          v.position.copy(this.tmpA).addScaledVector(v.velocity, ahead + (s * span) / TICK_RATE);
        }
      }
      for (const id of [...views.keys()]) if (!seen.has(id)) views.delete(id);
    };

    blend(this.missileViews as unknown as Map<number, MovingView>, s0.missiles, s1?.missiles, (id) => {
      const m = s0.missiles.find((x) => x.id === id);
      return { id, team: m?.team ?? 'usa', ownerId: m?.ownerId ?? 0, targetId: null, position: new Vector3(), velocity: new Vector3(), motorBurning: true, samplesFrom: s0.tick } as MissileView & { samplesFrom: number };
    });
    for (const m of s0.missiles) {
      const v = this.missileViews.get(m.id);
      if (!v) continue;
      v.targetId = m.targetId;
      v.motorBurning = m.motorBurning;
    }
    blend(this.bombViews as unknown as Map<number, MovingView>, s0.bombs, s1?.bombs, (id) => {
      const b = s0.bombs.find((x) => x.id === id);
      return { id, team: b?.team ?? 'russia', position: new Vector3(), velocity: new Vector3() };
    });
  }

  private refreshTracers(): void {
    const alpha = this.stepper.alpha;
    this.tracerViews.length = 0;
    for (const p of this.tracers) {
      const v: ProjectileView = { team: p.team, position: new Vector3().lerpVectors(p.prevPos, p.pos, alpha), velocity: new Vector3() };
      projectileVelocity(p, v.velocity);
      this.tracerViews.push(v);
    }
  }
}
