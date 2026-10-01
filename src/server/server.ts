import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import { buildTerrain } from '../shared/data/maps/map-definition.ts';
import { createTestRange } from '../shared/data/maps/test-range.ts';
import { DT } from '../shared/world/world.ts';
import type { ServerConfig } from './config.ts';
import { ClientConnection } from './connection.ts';
import { createHttpHandler } from './http.ts';
import { RoomManager } from './room-manager.ts';

export interface RunningServer {
  readonly port: number;
  readonly manager: RoomManager;
  readonly http: Server;
  close(): Promise<void>;
}

/** WebSocket frames from clients never need to be larger than this. */
const MAX_FRAME_BYTES = 4096;
/** At most this many simulation steps per timer callback, so a stalled process does not spiral. */
const MAX_STEPS_PER_WAKE = 5;

/** One process: the site, the game WebSocket at /ws and a fixed 60 Hz loop for every room (spec §7, §16). */
export async function startServer(config: ServerConfig): Promise<RunningServer> {
  const map = createTestRange(1);
  const terrain = buildTerrain(map);
  const manager = new RoomManager(config, map, terrain);
  const http = createServer(createHttpHandler({ manager, distDir: config.distDir, build: config.build, startedAtMs: Date.now() }));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  let nextId = 1;

  http.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.binaryType = 'arraybuffer';
      const conn = new ClientConnection(nextId++, ws, manager);
      ws.on('message', (data, isBinary) => {
        if (isBinary) conn.onMessage(data instanceof ArrayBuffer ? data : new Uint8Array(data as Buffer).slice().buffer);
        else conn.onMessage(String(data));
      });
      ws.on('close', () => conn.onClose());
      ws.on('error', (err) => console.warn('WebSocket error:', err.message));
    });
  });

  // Fixed-step loop: the timer wakes often and runs as many 60 Hz steps as real time asks for.
  let last = performance.now();
  let accumulator = 0;
  const loop = setInterval(() => {
    const now = performance.now();
    accumulator = Math.min(accumulator + (now - last) / 1000, MAX_STEPS_PER_WAKE * DT);
    last = now;
    while (accumulator >= DT) {
      manager.tick();
      accumulator -= DT;
    }
  }, 4);

  await new Promise<void>((resolve) => http.listen(config.port, config.host, resolve));
  const port = (http.address() as AddressInfo).port;
  return {
    port,
    manager,
    http,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(loop);
        manager.shutdown();
        for (const client of wss.clients) client.close(1001, 'server shutting down');
        wss.close();
        http.close(() => resolve());
        http.closeAllConnections();
      }),
  };
}

/** Addresses other machines on the network can use (spec §7: the server prints its LAN URLs). */
export function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${port}`);
  }
  return urls;
}
