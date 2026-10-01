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
const hello = (room = 'alpha', over: object = {}) =>
  JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, room, callsign: 'Ace', aircraftId: 'kestrel', mode: 'team-deathmatch', map: 'test-range', ...over });

function connect(manager: RoomManager, id: number, clock = { t: 0 }) {
  const socket = new FakeSocket();
  const conn = new ClientConnection(id, socket, manager, () => clock.t);
  return { socket, conn, clock };
}

describe('ClientConnection and RoomManager', () => {
  it('joins a room on hello, creating it with the requested mode', () => {
    const manager = new RoomManager(settings(), () => ({ map, terrain }));
    const { socket, conn } = connect(manager, 1);
    conn.onMessage(hello('alpha', { mode: 'strike' }));
    expect(socket.json()[0].type).toBe('welcome');
    expect(manager.room('alpha')?.mode).toBe('strike');
    expect(manager.list()).toEqual([{ name: 'alpha', mode: 'strike', map: 'test-range', humans: 1, maxHumans: 4 }]);
  });

  it("fixes a new room's map, weather and clock from its first pilot; Strike stays on the Test Range (M4)", () => {
    const asked: string[] = [];
    const manager = new RoomManager(settings(), (id) => {
      asked.push(id);
      return { map, terrain };
    });
    const first = connect(manager, 1);
    first.conn.onMessage(hello('alpha', { map: 'lechovia', environment: { weather: 'rain', startHour: 23, clockRunning: true } }));
    expect(first.socket.json()[0]).toMatchObject({ type: 'welcome', map: 'lechovia', environment: { weather: 'rain', startHour: 23, clockRunning: true } });
    const second = connect(manager, 2);
    second.conn.onMessage(hello('alpha', { map: 'test-range', environment: { weather: 'clear', startHour: 6 } }));
    expect(second.socket.json()[0]).toMatchObject({ type: 'welcome', map: 'lechovia', environment: { weather: 'rain' } });
    connect(manager, 3).conn.onMessage(hello('beta', { mode: 'strike', map: 'lechovia' }));
    expect(manager.room('beta')?.mapId).toBe('test-range');
    expect(asked).toEqual(['lechovia', 'test-range']);
  });

  it('rejects an out-of-date page and a full server', () => {
    const manager = new RoomManager(settings({ maxRooms: 1 }), () => ({ map, terrain }));
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
    const manager = new RoomManager(settings(), () => ({ map, terrain }));
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
    const manager = new RoomManager(settings(), () => ({ map, terrain }));
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
    const manager = new RoomManager(settings(), () => ({ map, terrain }));
    const { socket, conn, clock } = connect(manager, 1);
    conn.onMessage(hello());
    conn.onMessage('x');
    conn.onMessage('y');
    clock.t = 11_000;
    conn.onMessage('z');
    expect(socket.closedWith).toBeNull();
  });

  it('caps inputs at 120 per second and chat at one per second', () => {
    const manager = new RoomManager(settings(), () => ({ map, terrain }));
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

  it('passes jet choices and Free Flight requests to the room, at most 8 a second (M5)', () => {
    const manager = new RoomManager(settings(), () => ({ map, terrain }));
    const { socket, conn } = connect(manager, 1);
    conn.onMessage(hello('ff', { mode: 'free-flight' }));
    conn.onMessage(JSON.stringify({ type: 'world', weather: 'rain', hour: 20, clockRunning: false }));
    expect(socket.json().find((m) => m.type === 'environment')).toMatchObject({ environment: { weather: 'rain', startHour: 20 } });
    conn.onMessage(JSON.stringify({ type: 'jet', aircraftId: 'condor' }));
    const room = manager.room('ff')!;
    const me = [...room.world.aircraftList()].find((a) => !a.isBot)!;
    expect(me.nextAircraftId).toBe('condor');
    conn.onMessage(JSON.stringify({ type: 'flyFrom', x: 1000, z: 2000 }));
    expect(me.flight.pos.x).toBeCloseTo(1000, 0);
    for (let i = 0; i < 12; i++) conn.onMessage(JSON.stringify({ type: 'jet', aircraftId: 'shade' }));
    expect(socket.closedWith).toBe(CLOSE_VIOLATIONS);
  });

  it('closes a room 30 s after its last pilot leaves', () => {
    const manager = new RoomManager(settings(), () => ({ map, terrain }));
    const { conn } = connect(manager, 1);
    conn.onMessage(hello());
    conn.onClose();
    manager.tick(29_000 + Date.now());
    expect(manager.roomCount).toBe(1);
    manager.tick(31_000 + Date.now());
    expect(manager.roomCount).toBe(0);
  });
});
