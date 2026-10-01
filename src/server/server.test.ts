import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { decodeSnapshot, encodeInput, type Snapshot } from '../shared/net/codec.ts';
import { PROTOCOL_VERSION, type ServerJsonMessage } from '../shared/net/protocol.ts';
import { neutralInput } from '../shared/physics/controls.ts';
import type { ServerConfig } from './config.ts';
import { type RunningServer, startServer } from './server.ts';

const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  maxRooms: 4,
  maxHumansPerRoom: 4,
  teamSize: 1,
  botSkill: 'rookie',
  build: 'test-build',
  idleCloseMs: 30_000,
  distDir: null,
};

let server: RunningServer;
beforeAll(async () => {
  server = await startServer(config);
});
afterAll(async () => {
  await server.close();
});

/** A test client that records what the server sends. */
async function client(aircraftId: string, callsign: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  ws.binaryType = 'arraybuffer';
  const json: ServerJsonMessage[] = [];
  const snapshots: Snapshot[] = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) snapshots.push(decodeSnapshot(data as ArrayBuffer));
    else json.push(JSON.parse(String(data)) as ServerJsonMessage);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, room: 'it', callsign, aircraftId, mode: 'team-deathmatch' }));
  return { ws, json, snapshots };
}

const until = async (check: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('game server over real WebSockets', () => {
  it('lets two pilots join one room, see each other and fly', async () => {
    const a = await client('kestrel', 'Alpha');
    const b = await client('kobchik', 'Bravo');
    await until(() => a.json.some((m) => m.type === 'welcome') && b.json.some((m) => m.type === 'welcome'));
    const welcomeA = a.json.find((m) => m.type === 'welcome');
    expect(welcomeA).toMatchObject({ build: 'test-build', room: 'it', modeId: 'team-deathmatch' });
    await until(() => a.json.some((m) => m.type === 'roster' && m.players.filter((p) => !p.isBot).length === 2));

    for (let s = 1; s <= 20; s++) a.ws.send(encodeInput(s, { ...neutralInput(1), roll: 0.5 }, 4));
    await until(() => a.snapshots.some((s) => s.ackSeq === 20));
    const last = a.snapshots.at(-1);
    expect(last?.own).not.toBeNull();
    expect(last?.aircraft.length).toBe(2);
    await until(() => b.snapshots.length > 5);

    const health = (await (await fetch(`http://127.0.0.1:${server.port}/healthz`)).json()) as { ok: boolean; players: number };
    expect(health).toMatchObject({ ok: true, players: 2 });
    const rooms = (await (await fetch(`http://127.0.0.1:${server.port}/api/rooms`)).json()) as { rooms: { name: string; humans: number }[] };
    expect(rooms.rooms[0]).toMatchObject({ name: 'it', humans: 2 });

    b.ws.close();
    await until(() => a.json.some((m) => m.type === 'roster' && m.players.filter((p) => !p.isBot).length === 1));
    a.ws.close();
  });

  it('answers pages with a hint when there is no site build', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('npm run build');
  });
});
