import type { DifficultyId } from '../shared/ai/difficulty.ts';
import type { MapDefinition } from '../shared/data/maps/map-definition.ts';
import type { MapId } from '../shared/data/maps/registry.ts';
import type { Terrain } from '../shared/map/terrain.ts';
import { type HelloMessage, type OnlineModeId, PROTOCOL_VERSION } from '../shared/net/protocol.ts';
import { type Peer, Room } from './room.ts';

export interface RoomSettings {
  maxRooms: number;
  maxHumansPerRoom: number;
  teamSize: number;
  botSkill: DifficultyId;
  build: string;
  /** an idle room closes this long after its last human leaves (spec §16: 30 s) */
  idleCloseMs: number;
}

export interface RoomInfo {
  name: string;
  mode: OnlineModeId;
  map: MapId;
  humans: number;
  maxHumans: number;
}

/** A map ready for rooms: the definition and the terrain built from it, shared by every room on it. */
export interface RoomMap {
  map: MapDefinition;
  terrain: Terrain;
}

/** Strike was laid out on the Test Range, so a Strike room flies there whatever the creator chose (M4). */
export function roomMapId(mode: OnlineModeId, requested: MapId): MapId {
  return mode === 'strike' ? 'test-range' : requested;
}

/** Creates rooms on first join and closes idle or broken ones (spec §16). */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly roomOfPeer = new Map<number, Room>();
  private readonly settings: RoomSettings;
  private readonly maps: (id: MapId) => RoomMap;

  /** `maps` returns each map's definition and terrain (built once at start). */
  constructor(settings: RoomSettings, maps: (id: MapId) => RoomMap) {
    this.settings = settings;
    this.maps = maps;
  }

  get playerCount(): number {
    return this.roomOfPeer.size;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  room(name: string): Room | undefined {
    return this.rooms.get(name);
  }

  roomOf(peerId: number): Room | undefined {
    return this.roomOfPeer.get(peerId);
  }

  join(peer: Peer, hello: HelloMessage): { ok: true; room: Room } | { ok: false; reason: string } {
    if (hello.version !== PROTOCOL_VERSION) return { ok: false, reason: 'The game has been updated. Reload the page.' };
    this.leave(peer.id);
    let room = this.rooms.get(hello.room);
    if (!room) {
      if (this.rooms.size >= this.settings.maxRooms) return { ok: false, reason: 'The server is full. Try again later.' };
      const mapId = roomMapId(hello.mode, hello.map);
      const { map, terrain } = this.maps(mapId);
      room = new Room(
        {
          name: hello.room,
          mode: hello.mode,
          teamSize: this.settings.teamSize,
          botSkill: this.settings.botSkill,
          maxHumans: this.settings.maxHumansPerRoom,
          build: this.settings.build,
          mapId,
          environment: hello.environment,
        },
        map,
        terrain,
      );
      this.rooms.set(hello.room, room);
    }
    const result = room.join(peer, hello);
    if (!result.ok) {
      if (room.humanCount === 0) this.rooms.delete(room.name);
      return result;
    }
    this.roomOfPeer.set(peer.id, room);
    return { ok: true, room };
  }

  leave(peerId: number, nowMs = Date.now()): void {
    const room = this.roomOfPeer.get(peerId);
    if (!room) return;
    this.roomOfPeer.delete(peerId);
    room.leave(peerId, nowMs);
  }

  /** One 60 Hz step of every room; closes rooms that broke or stayed empty too long. */
  tick(nowMs = Date.now()): void {
    for (const room of this.rooms.values()) {
      if (room.humanCount > 0) room.tick();
      if (room.broken) {
        console.error(`Room ${room.name} closed after repeated failures`);
        room.shutdown();
        this.close(room);
      } else if (room.emptySinceMs !== null && nowMs - room.emptySinceMs >= this.settings.idleCloseMs) {
        this.close(room);
      }
    }
  }

  /** Rooms for Quick play and the health check, busiest first. */
  list(): RoomInfo[] {
    return [...this.rooms.values()]
      .map((r) => ({ name: r.name, mode: r.mode, map: r.mapId, humans: r.humanCount, maxHumans: this.settings.maxHumansPerRoom }))
      .sort((a, b) => b.humans - a.humans || a.name.localeCompare(b.name));
  }

  shutdown(): void {
    for (const room of this.rooms.values()) room.shutdown();
  }

  private close(room: Room): void {
    this.rooms.delete(room.name);
    for (const [peer, r] of this.roomOfPeer) if (r === room) this.roomOfPeer.delete(peer);
  }
}
