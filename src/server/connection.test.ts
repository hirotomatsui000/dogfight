import { beforeAll, describe, expect, it } from 'vitest';
import { buildTerrain, type MapDefinition } from '../shared/data/maps/map-definition.ts';
import { createTestRange } from '../shared/data/maps/test-range.ts';
import type { GridTerrain } from '../shared/map/terrain.ts';
import { encodeInput } from '../shared/net/codec.ts';
import { PROTOCOL_VERSION, type ServerJsonMessage } from '../shared/net/protocol.ts';
import { neutralInput } from '../shared/physics/controls.ts';
import { ClientConnection, CLOSE_REJECTED, CLOSE_VIOLATIONS, type SocketLike } from './connection.ts';
import { RoomManager, type RoomSettings } from './room-manager.ts';

let map: MapDefinition;
let terrain: GridTerrain;
beforeAll(() => {
  map = createTestRange(1);
  terrain = buildTerrain(map);
});

class FakeSocket implements SocketLike {
  sent: (string | ArrayBuffer)[] = [];
  closedWith: number | null = null;
  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
  }
  close(code?: number): void {
    this.closedWith = code ?? 1000;
  }
  json(): ServerJsonMessage[] {
    return this.sent.filter((d): d is string => typeof d === 'string').map((d) => JSON.parse(d) as ServerJsonMessage);
  }
}

const settings = (over: Partial<RoomSettings> = {}): RoomSettings => ({ maxRooms: 2, maxHumansPerRoom: 4, teamSize: 2, botSkill: 'rookie', build: 'test', idleCloseMs: 30_000, ...over });
const hello = (room = 'alpha', over: object = {}) => JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, room, callsign: 'Ace', aircraftId: 'kestrel', mode: 'team-deathmatch', ...over });

function connect(manager: RoomManager, id: number, clock = { t: 0 }) {
  const socket = new FakeSocket();
  const conn = new ClientConnection(id, socket, manager, () => clock.t);
  return { socket, conn, clock };
}

describe('ClientConnection and RoomManager', () => {
  it('joins a room on hello, creating it with the requested mode', () => {
    const manager = new RoomManager(settings(), map, terrain);
    const { socket, conn } = connect(manager, 1);
    conn.onMessage(hello('alpha', { mode: 'strike' }));
    expect(socket.json()[0].type).toBe('welcome');
    expect(manager.room('alpha')?.mode).toBe('strike');
    expect(manager.list()).toEqual([{ name: 'alpha', mode: 'strike', humans: 1, maxHumans: 4 }]);
  });

  it('rejects an out-of-date page and a full server', () => {
    const manager = new RoomManager(settings({ maxRooms: 1 }), map, terrain);
    const old = connect(manager, 1);
    old.conn.onMessage(hello('alpha', { version: PROTOCOL_VERSION + 1 }));
    expect(old.socket.json()[0]).toMatchObject({ type: 'reject' });
    expect(old.socket.closedWith).toBe(CLOSE_REJECTED);
    connect(manager, 2).conn.onMessage(hello('alpha'));
    const late = connect(manager, 3);
    late.conn.onMessage(hello('beta'));
    expect(late.socket.json()[0]).toMatchObject({ type: 'reject', reason: expect.stringContaining('full') });
  });

  it('passes inputs to the room and answers pings', () => {
    const manager = new RoomManager(settings(), map, terrain);
    const { socket, conn } = connect(manager, 1);
    conn.onMessage(hello());
    conn.onMessage(encodeInput(5, neutralInput(1), 0));
    conn.onMessage(JSON.stringify({ type: 'ping', t: 1234 }));
    manager.tick();
    manager.tick();
    expect(socket.json().some((m) => m.type === 'pong' && m.t === 1234)).toBe(true);
    expect(socket.sent.some((d) => typeof d !== 'string')).toBe(true);
  });

  it('disconnects a client after three violations within 10 s, and only that client', () => {
    const manager = new RoomManager(settings(), map, terrain);
    const good = connect(manager, 1);
    good.conn.onMessage(hello());
    const bad = connect(manager, 2);
    bad.conn.onMessage(hello());
    bad.conn.onMessage('garbage');
    bad.conn.onMessage(new ArrayBuffer(200));
    expect(bad.socket.closedWith).toBeNull();
    bad.conn.onMessage(JSON.stringify({ type: 'chat', index: 99 }));
    expect(bad.socket.closedWith).toBe(CLOSE_VIOLATIONS);
    expect(good.socket.closedWith).toBeNull();
    expect(manager.room('alpha')?.humanCount).toBe(1);
  });

  it('forgives violations older than 10 s', () => {
    const manager = new RoomManager(settings(), map, terrain);
    const { socket, conn, clock } = connect(manager, 1);
    conn.onMessage(hello());
    conn.onMessage('x');
    conn.onMessage('y');
    clock.t = 11_000;
    conn.onMessage('z');
    expect(socket.closedWith).toBeNull();
  });

  it('caps inputs at 120 per second and chat at one per second', () => {
    const manager = new RoomManager(settings(), map, terrain);
    const { socket, conn, clock } = connect(manager, 1);
    conn.onMessage(hello());
    for (let i = 0; i < 123; i++) conn.onMessage(encodeInput(i + 1, neutralInput(), 0));
    expect(socket.closedWith).toBe(CLOSE_VIOLATIONS);
    const chatty = connect(manager, 2, clock);
    chatty.conn.onMessage(hello());
    chatty.conn.onMessage(JSON.stringify({ type: 'chat', index: 0 }));
    chatty.conn.onMessage(JSON.stringify({ type: 'chat', index: 0 }));
    clock.t += 1500;
    chatty.conn.onMessage(JSON.stringify({ type: 'chat', index: 1 }));
    expect(chatty.socket.json().filter((m) => m.type === 'chat')).toHaveLength(2);
  });

  it('closes a room 30 s after its last pilot leaves', () => {
    const manager = new RoomManager(settings(), map, terrain);
    const { conn } = connect(manager, 1);
    conn.onMessage(hello());
    conn.onClose();
    manager.tick(29_000 + Date.now());
    expect(manager.roomCount).toBe(1);
    manager.tick(31_000 + Date.now());
    expect(manager.roomCount).toBe(0);
  });
});
