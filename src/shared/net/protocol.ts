import type { TeamId } from '../data/aircraft/types.ts';
import { isMapId, type MapId } from '../data/maps/registry.ts';
import type { ModeStatus } from '../modes/mode.ts';
import type { GameEvent } from '../world/events.ts';
import { SPAWN_STARTS, type SpawnStart } from '../world/spawns.ts';
import { CALM_NOON, type EnvironmentSettings } from '../world/time-of-day.ts';
import { isWeatherId, type WeatherId } from '../world/weather.ts';

/** Bumped whenever a message layout changes; client and server must agree (spec §7, M2; 3 since M4, 4 since M5). */
export const PROTOCOL_VERSION = 4;

/** The server sends a snapshot every this many ticks (30 Hz at 60 Hz ticks). */
export const SNAPSHOT_EVERY_TICKS = 2;

/** Limits on what a client may send (spec §7). */
export const MAX_CLIENT_BINARY_BYTES = 64;
export const MAX_CLIENT_JSON_BYTES = 2048;
export const MAX_INPUTS_PER_S = 120;
export const MAX_CHATS_PER_S = 1;
/** Jet choices, Free Flight weather changes and "fly from here" together (M5). */
export const MAX_ACTIONS_PER_S = 8;

/** Modes a room can be created with (M5: all but Training). */
export type OnlineModeId = 'team-deathmatch' | 'air-superiority' | 'team-objective' | 'free-flight' | 'strike';
export const ONLINE_MODES: readonly OnlineModeId[] = ['team-deathmatch', 'air-superiority', 'team-objective', 'free-flight', 'strike'];

/** Preset quick-chat lines (spec §24: no free text). */
export const QUICK_CHAT: readonly string[] = ['Nice shot!', 'Help me!', 'On my way', 'Good game'];

export const DEFAULT_ROOM = 'public';

/** A typed error for anything a peer sends that breaks the protocol. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export interface HelloMessage {
  type: 'hello';
  version: number;
  room: string;
  callsign: string;
  aircraftId: string;
  mode: OnlineModeId;
  /** for a new room: its map, weather and clock (M4); a joining pilot gets the room's own */
  map: MapId;
  environment: EnvironmentSettings;
  /** where this pilot starts: in the air or on the runway (M4) */
  start: SpawnStart;
}

export interface PingMessage {
  type: 'ping';
  t: number;
}

export interface ChatMessage {
  type: 'chat';
  index: number;
}

/** The jet this pilot flies from the next respawn on (M5). */
export interface JetMessage {
  type: 'jet';
  aircraftId: string;
}

/** Free Flight rooms (M5): new weather and the hour it is now, for everyone in the room. */
export interface WorldMessage {
  type: 'world';
  weather: WeatherId;
  hour: number;
  clockRunning: boolean;
}

/** Free Flight rooms (M5): fly from a point of the map (a runway when the point is on an airfield). */
export interface FlyFromMessage {
  type: 'flyFrom';
  x: number;
  z: number;
}

export type ClientJsonMessage = HelloMessage | PingMessage | ChatMessage | JetMessage | WorldMessage | FlyFromMessage;

export interface RosterEntry {
  id: number;
  callsign: string;
  team: TeamId;
  aircraftId: string;
  isBot: boolean;
  kills: number;
  deaths: number;
}

export type ServerJsonMessage =
  | {
      type: 'welcome';
      version: number;
      build: string;
      room: string;
      you: number;
      modeId: OnlineModeId;
      mapSeed: number;
      /** the room's map, weather and clock (M4) */
      map: MapId;
      environment: EnvironmentSettings;
      tick: number;
      tickRate: number;
      snapshotEvery: number;
    }
  | { type: 'reject'; reason: string }
  | { type: 'pong'; t: number; tick: number }
  | { type: 'roster'; players: RosterEntry[] }
  | { type: 'events'; tick: number; events: GameEvent[] }
  | { type: 'status'; tick: number; status: ModeStatus }
  | { type: 'chat'; from: number; index: number }
  | { type: 'matchEnd'; status: ModeStatus; restartInS: number }
  | { type: 'matchStart'; you: number; tick: number }
  /** a Free Flight room's weather or clock changed (M5) */
  | { type: 'environment'; environment: EnvironmentSettings }
  | { type: 'shutdown' };

/** Room names: 1–24 of a–z, 0–9 and dashes; anything else is folded into that form (or the public room). */
export function sanitizeRoomName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) : '';
  return s || DEFAULT_ROOM;
}

/** Callsigns: letters, digits, space, dot, dash and underscore, at most 16 (as on the title screen). */
export function sanitizeCallsign(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 16) : '';
  return s || 'Pilot';
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Weather and clock from a client: known weather, an hour in 0 … 24, a boolean clock; defaults otherwise. */
export function sanitizeEnvironment(raw: unknown): EnvironmentSettings {
  const r = isRecord(raw) ? raw : {};
  const hour = typeof r.startHour === 'number' && Number.isFinite(r.startHour) ? ((r.startHour % 24) + 24) % 24 : CALM_NOON.startHour;
  return { weather: isWeatherId(r.weather) ? r.weather : 'clear', startHour: hour, clockRunning: r.clockRunning === true };
}

/** Parses and checks a JSON text frame from a client. Throws ProtocolError on anything malformed. */
export function parseClientJson(text: string): ClientJsonMessage {
  if (text.length > MAX_CLIENT_JSON_BYTES) throw new ProtocolError('message too large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProtocolError('not JSON');
  }
  if (!isRecord(raw)) throw new ProtocolError('not an object');
  switch (raw.type) {
    case 'hello': {
      if (typeof raw.version !== 'number' || typeof raw.aircraftId !== 'string') throw new ProtocolError('bad hello');
      const mode = ONLINE_MODES.find((m) => m === raw.mode) ?? 'team-deathmatch';
      const map = isMapId(raw.map) ? raw.map : 'lechovia';
      const start = SPAWN_STARTS.find((s) => s === raw.start) ?? 'air';
      return { type: 'hello', version: raw.version, room: sanitizeRoomName(raw.room), callsign: sanitizeCallsign(raw.callsign), aircraftId: raw.aircraftId.slice(0, 32), mode, map, environment: sanitizeEnvironment(raw.environment), start };
    }
    case 'ping':
      if (typeof raw.t !== 'number' || !Number.isFinite(raw.t)) throw new ProtocolError('bad ping');
      return { type: 'ping', t: raw.t };
    case 'chat':
      if (!Number.isInteger(raw.index) || (raw.index as number) < 0 || (raw.index as number) >= QUICK_CHAT.length) throw new ProtocolError('bad chat');
      return { type: 'chat', index: raw.index as number };
    case 'jet':
      if (typeof raw.aircraftId !== 'string') throw new ProtocolError('bad jet');
      return { type: 'jet', aircraftId: raw.aircraftId.slice(0, 32) };
    case 'world': {
      if (!isWeatherId(raw.weather) || typeof raw.hour !== 'number' || !Number.isFinite(raw.hour)) throw new ProtocolError('bad world');
      return { type: 'world', weather: raw.weather, hour: ((raw.hour % 24) + 24) % 24, clockRunning: raw.clockRunning === true };
    }
    case 'flyFrom':
      if (typeof raw.x !== 'number' || typeof raw.z !== 'number' || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)) throw new ProtocolError('bad flyFrom');
      return { type: 'flyFrom', x: raw.x, z: raw.z };
    default:
      throw new ProtocolError('unknown message type');
  }
}
