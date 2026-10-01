import { botCallsign } from '../shared/ai/bot-names.ts';
import { DIFFICULTIES, type DifficultyId } from '../shared/ai/difficulty.ts';
import { getAircraft, randomAircraft } from '../shared/data/aircraft/registry.ts';
import type { AircraftConfig, TeamId } from '../shared/data/aircraft/types.ts';
import type { MapDefinition } from '../shared/data/maps/map-definition.ts';
import type { MapId } from '../shared/data/maps/registry.ts';
import type { Terrain } from '../shared/map/terrain.ts';
import { Rng } from '../shared/math/rng.ts';
import type { ModeStatus } from '../shared/modes/mode.ts';
import { createMode } from '../shared/modes/registry.ts';
import { STRIKE_AIRCRAFT_PER_PILOT } from '../shared/modes/strike.ts';
import { type DecodedInput, encodeSnapshot } from '../shared/net/codec.ts';
import { type HelloMessage, type OnlineModeId, PROTOCOL_VERSION, type RosterEntry, type ServerJsonMessage, SNAPSHOT_EVERY_TICKS } from '../shared/net/protocol.ts';
import { type ControlInput, neutralInput } from '../shared/physics/controls.ts';
import type { AircraftEntity } from '../shared/world/entities.ts';
import type { GameEvent } from '../shared/world/events.ts';
import type { SpawnStart } from '../shared/world/spawns.ts';
import { CALM_NOON, type EnvironmentSettings, environmentAt } from '../shared/world/time-of-day.ts';
import type { WeatherId } from '../shared/world/weather.ts';
import { TICK_RATE, World } from '../shared/world/world.ts';
import { ownState, sharedSnapshot } from './snapshot.ts';

/** One connected client, whatever the transport (WebSocket in production, a fake in tests). */
export interface Peer {
  readonly id: number;
  sendJson(msg: ServerJsonMessage): void;
  sendBinary(buf: ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

export interface RoomOptions {
  name: string;
  mode: OnlineModeId;
  /** pilots per team, filled with bots (spec §7: default 4) */
  teamSize: number;
  botSkill: DifficultyId;
  maxHumans: number;
  /** server build, sent in `welcome` so pages can tell they are out of date */
  build: string;
  seed?: number;
  /** seconds between the end of a match and the next (default 10) */
  restartDelayS?: number;
  /** score limit of the scoring modes (tests use small ones) */
  tdmScoreLimit?: number;
  /** the room's map id, weather and clock (M4; fixed by the pilot who creates the room) */
  mapId?: MapId;
  environment?: EnvironmentSettings;
}

/** Inputs waiting per player; older ones are dropped beyond this (about half a second). */
export const MAX_QUEUE = 30;
export { STRIKE_AIRCRAFT_PER_PILOT } from '../shared/modes/strike.ts';
/** Status updates go out on change, and at least this often so clocks stay in step. */
const STATUS_EVERY_TICKS = TICK_RATE;

interface Player {
  readonly peer: Peer;
  readonly callsign: string;
  /** the jet this pilot flies; a jet change (M5) also carries over to the next match */
  aircraftId: string;
  readonly team: TeamId;
  /** in the air or on the runway (M4) */
  readonly start: SpawnStart;
  /** the player's aircraft in the current World */
  entityId: number;
  readonly queue: DecodedInput[];
  readonly lastInput: ControlInput;
  ackSeq: number;
}

/**
 * An authoritative match (spec §7, §16): a World at 60 Hz, one aircraft per human, bots filling each team, input
 * queues, 30 Hz snapshots and event fan-out. Time is driven from outside through `tick()`.
 */
export class Room {
  readonly name: string;
  readonly mode: OnlineModeId;
  world: World;
  private readonly options: RoomOptions;
  private readonly map: MapDefinition;
  private readonly terrain: Terrain;
  private readonly players = new Map<number, Player>();
  private readonly inputs = new Map<number, ControlInput>();
  private pendingEvents: GameEvent[] = [];
  private lastStatusKey = '';
  private lastStatusTick = -Infinity;
  private rosterDirty = true;
  private endedAtTick: number | null = null;
  private matchNumber = 0;
  /** consecutive failed steps; three close the room (spec §16) */
  failures = 0;
  /** wall-clock ms when the last human left, for closing idle rooms */
  emptySinceMs: number | null = null;
  /** picks each bot's jet, so bots fly a mix of the roster */
  private readonly botJets: Rng;

  constructor(options: RoomOptions, map: MapDefinition, terrain: Terrain) {
    this.options = options;
    this.name = options.name;
    this.mode = options.mode;
    this.map = map;
    this.terrain = terrain;
    this.botJets = new Rng((options.seed ?? Math.floor(Math.random() * 0x7fffffff)) ^ 0x2545f491);
    this.world = this.createWorld();
  }

  /** The room's map (M4). */
  get mapId(): MapId {
    return this.options.mapId ?? (this.map.id === 'lechovia' ? 'lechovia' : 'test-range');
  }

  /** The room's weather and clock (M4); Free Flight pilots can change them (M5). */
  get environment(): EnvironmentSettings {
    return this.options.environment ?? CALM_NOON;
  }

  /** Free Flight rooms fly without bots or weapons (M5). */
  private get freeFlight(): boolean {
    return this.mode === 'free-flight';
  }

  get humanCount(): number {
    return this.players.size;
  }

  get broken(): boolean {
    return this.failures >= 3;
  }

  join(peer: Peer, hello: HelloMessage): { ok: true } | { ok: false; reason: string } {
    if (this.players.size >= this.options.maxHumans) return { ok: false, reason: `Room "${this.name}" is full` };
    let config: AircraftConfig;
    try {
      config = getAircraft(hello.aircraftId);
    } catch {
      return { ok: false, reason: `Unknown aircraft "${hello.aircraftId}"` };
    }
    const player: Player = {
      peer,
      callsign: hello.callsign,
      aircraftId: config.id,
      team: config.team,
      start: hello.start,
      entityId: -1,
      queue: [],
      lastInput: neutralInput(0.8),
      ackSeq: 0,
    };
    this.players.set(peer.id, player);
    this.emptySinceMs = null;
    this.removeBot(player.team);
    player.entityId = this.world.addAircraft({ callsign: player.callsign, team: player.team, aircraftId: player.aircraftId, start: player.start }).id;
    peer.sendJson({
      type: 'welcome',
      version: PROTOCOL_VERSION,
      build: this.options.build,
      room: this.name,
      you: player.entityId,
      modeId: this.mode,
      mapSeed: this.map.seed,
      map: this.mapId,
      environment: this.world.environment,
      tick: this.world.tick,
      tickRate: TICK_RATE,
      snapshotEvery: SNAPSHOT_EVERY_TICKS,
    });
    this.sendRoster();
    this.sendStatus(true);
    return { ok: true };
  }

  leave(peerId: number, nowMs = Date.now()): void {
    const p = this.players.get(peerId);
    if (!p) return;
    this.players.delete(peerId);
    this.world.removeAircraft(p.entityId);
    this.fillBots();
    this.sendRoster();
    if (this.players.size === 0) this.emptySinceMs = nowMs;
  }

  receiveInput(peerId: number, input: DecodedInput): void {
    const p = this.players.get(peerId);
    if (!p) return;
    if (input.seq <= p.ackSeq && p.ackSeq !== 0) return;
    p.queue.push(input);
    if (p.queue.length > MAX_QUEUE) p.queue.splice(0, p.queue.length - MAX_QUEUE);
  }

  chat(peerId: number, index: number): void {
    const p = this.players.get(peerId);
    if (p) this.broadcast({ type: 'chat', from: p.entityId, index });
  }

  /** The jet a pilot flies from their next respawn on, and in the next match (M5). */
  chooseJet(peerId: number, aircraftId: string): void {
    const p = this.players.get(peerId);
    if (p && this.world.setNextAircraft(p.entityId, aircraftId)) p.aircraftId = aircraftId;
  }

  /** Free Flight (M5): anyone in the room sets the weather and the hour it is now, for everyone. */
  changeWorld(peerId: number, weather: WeatherId, hour: number, clockRunning: boolean): void {
    if (!this.freeFlight || !this.players.has(peerId)) return;
    const env = environmentAt(weather, hour, clockRunning, this.world.tick / TICK_RATE);
    this.world.setEnvironment(env);
    this.options.environment = env;
    this.broadcast({ type: 'environment', environment: env });
  }

  /** Free Flight (M5): fly from a point of the map. */
  flyFrom(peerId: number, x: number, z: number): void {
    const p = this.players.get(peerId);
    if (p && this.freeFlight) this.world.flyFrom(p.entityId, x, z);
  }

  pong(peerId: number, t: number): void {
    this.players.get(peerId)?.peer.sendJson({ type: 'pong', t, tick: this.world.tick });
  }

  /** One 60 Hz step: consume one input per player, step the World, and every other tick send snapshots. */
  tick(): void {
    this.inputs.clear();
    for (const p of this.players.values()) {
      const next = p.queue.shift();
      const entity = this.world.getAircraft(p.entityId);
      if (next) {
        Object.assign(p.lastInput, next.input);
        p.ackSeq = next.seq;
        if (entity) entity.viewDelayTicks = next.viewDelay;
      } else {
        // Hold the stick and throttle, but a press is never repeated.
        p.lastInput.fireMissile = false;
        p.lastInput.countermeasures = false;
        p.lastInput.dropBomb = false;
        p.lastInput.cycleTarget = false;
      }
      this.inputs.set(p.entityId, p.lastInput);
    }
    try {
      this.world.step(this.inputs);
      this.failures = 0;
    } catch (err) {
      this.failures++;
      console.error(`Room ${this.name}: step failed (${this.failures} in a row)`, err);
    }
    for (const e of this.world.drainEvents()) {
      this.pendingEvents.push(e);
      if (e.type === 'destroyed' || e.type === 'spawned') this.rosterDirty = true;
    }

    const status = this.world.mode.status(this.world);
    if (status.winner !== null && this.endedAtTick === null) {
      this.endedAtTick = this.world.tick;
      this.flush(status);
      this.broadcast({ type: 'matchEnd', status, restartInS: this.restartDelayS });
    } else if (this.endedAtTick !== null && this.world.tick - this.endedAtTick >= this.restartDelayS * TICK_RATE) {
      this.restart();
      return;
    }
    if (this.world.tick % SNAPSHOT_EVERY_TICKS === 0) this.flush(status);
  }

  /** Tells every client the server is going away. */
  shutdown(): void {
    this.broadcast({ type: 'shutdown' });
  }

  private get restartDelayS(): number {
    return this.options.restartDelayS ?? 10;
  }

  private createWorld(): World {
    const mode = createMode(this.mode, {
      strike: { aircraftPerTeam: STRIKE_AIRCRAFT_PER_PILOT * Math.max(1, this.options.teamSize) },
      scoreLimit: this.options.tdmScoreLimit,
    });
    const seed = (this.options.seed ?? Math.floor(Math.random() * 0x7fffffff)) + this.matchNumber;
    const world = new World({ map: this.map, terrain: this.terrain, mode, seed, environment: this.environment });
    this.world = world;
    for (const p of this.players.values()) p.entityId = world.addAircraft({ callsign: p.callsign, team: p.team, aircraftId: p.aircraftId, start: p.start }).id;
    this.fillBots();
    return world;
  }

  private restart(): void {
    this.matchNumber++;
    this.endedAtTick = null;
    this.pendingEvents = [];
    this.createWorld();
    this.rosterDirty = true;
    for (const p of this.players.values()) {
      p.queue.length = 0;
      p.peer.sendJson({ type: 'matchStart', you: p.entityId, tick: this.world.tick });
    }
    this.lastStatusKey = '';
    this.flush(this.world.mode.status(this.world));
  }

  private humansOn(team: TeamId): number {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team) n++;
    return n;
  }

  /** Bots that fill seats: never the Sentinels the mode flies itself. */
  private botsOn(team: TeamId): AircraftEntity[] {
    return [...this.world.aircraftList()].filter((a) => a.isBot && !a.support && a.team === team);
  }

  private removeBot(team: TeamId): void {
    const bot = this.botsOn(team).at(-1);
    if (bot) this.world.removeAircraft(bot.id);
  }

  /** Tops each team up with bots to the team size (none in Free Flight). */
  private fillBots(): void {
    const size = this.freeFlight ? 0 : this.options.teamSize;
    for (const team of ['usa', 'russia'] as const) {
      const bots = this.botsOn(team);
      let missing = size - this.humansOn(team) - bots.length;
      let index = bots.length;
      while (missing-- > 0) {
        const jet = randomAircraft(team, this.botJets);
        this.world.addAircraft({ callsign: botCallsign(team, index++), team, aircraftId: jet.id, bot: DIFFICULTIES[this.options.botSkill] });
      }
    }
  }

  private sendRoster(): void {
    this.rosterDirty = false;
    this.broadcast({ type: 'roster', players: this.roster() });
  }

  private roster(): RosterEntry[] {
    return [...this.world.aircraftList()].map((a) => ({
      id: a.id,
      callsign: a.callsign,
      team: a.team,
      aircraftId: a.config.id,
      isBot: a.isBot,
      kills: a.kills,
      deaths: a.deaths,
    }));
  }

  private sendStatus(force: boolean, status: ModeStatus = this.world.mode.status(this.world)): void {
    // Whole seconds are enough for the clock; clients count down in between.
    const key = JSON.stringify({ ...status, timeLeftS: status.timeLeftS === null ? null : Math.ceil(status.timeLeftS) });
    if (!force && key === this.lastStatusKey && this.world.tick - this.lastStatusTick < STATUS_EVERY_TICKS) return;
    this.lastStatusKey = key;
    this.lastStatusTick = this.world.tick;
    this.broadcast({ type: 'status', tick: this.world.tick, status });
  }

  /** Roster, events and status as JSON, then each player's binary snapshot. */
  private flush(status: ModeStatus): void {
    if (this.rosterDirty) this.sendRoster();
    if (this.pendingEvents.length > 0) {
      this.broadcast({ type: 'events', tick: this.world.tick, events: this.pendingEvents });
      this.pendingEvents = [];
    }
    this.sendStatus(false, status);
    const shared = sharedSnapshot(this.world);
    for (const p of this.players.values()) {
      const own = this.world.getAircraft(p.entityId);
      p.peer.sendBinary(encodeSnapshot({ ...shared, ackSeq: p.ackSeq, queueDepth: Math.min(p.queue.length, 255), own: own ? ownState(own) : null }));
    }
  }

  private broadcast(msg: ServerJsonMessage): void {
    for (const p of this.players.values()) p.peer.sendJson(msg);
  }
}
