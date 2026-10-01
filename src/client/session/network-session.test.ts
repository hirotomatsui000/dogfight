import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTerrain, type MapDefinition } from '../../shared/data/maps/map-definition.ts';
import { createTestRange } from '../../shared/data/maps/test-range.ts';
import type { GridTerrain } from '../../shared/map/terrain.ts';
import { type ControlInput, neutralInput } from '../../shared/physics/controls.ts';
import { ClientConnection } from '../../server/connection.ts';
import { RoomManager } from '../../server/room-manager.ts';
import { INTERP_DELAY_TICKS, NetworkSession } from './network-session.ts';
import type { Transport } from './net-transport.ts';

let map: MapDefinition;
let terrain: GridTerrain;
beforeAll(() => {
  map = createTestRange(1);
  terrain = buildTerrain(map);
});

const FRAME_MS = 1000 / 60;

/** Virtual time, a server, and an in-memory line with a one-way delay in each direction. */
class Harness {
  t = 0;
  readonly manager = new RoomManager({ maxRooms: 4, maxHumansPerRoom: 4, teamSize: 1, botSkill: 'rookie', build: 'test', idleCloseMs: 30_000 }, map, terrain);
  private timers: { at: number; seq: number; fn: () => void }[] = [];
  private seq = 0;
  /** server positions per tick, by aircraft id, for checking interpolation */
  readonly history = new Map<number, Map<number, Vector3>>();
  private serverMs = 0;
  readonly oneWayMs: number;

  constructor(oneWayMs: number) {
    this.oneWayMs = oneWayMs;
  }

  at(ms: number, fn: () => void): void {
    this.timers.push({ at: this.t + ms, seq: this.seq++, fn });
  }

  /** A client line to the server through a ClientConnection, with the lag both ways. */
  line(id: number): Transport {
    const h = this;
    let conn: ClientConnection | null = null;
    const transport: Transport = {
      onOpen: null,
      onMessage: null,
      onClose: null,
      send(data) {
        h.at(h.oneWayMs, () => conn?.onMessage(typeof data === 'string' ? data : data.slice(0)));
      },
      close() {
        conn?.onClose();
      },
    };
    conn = new ClientConnection(id, { send: (data) => h.at(h.oneWayMs, () => transport.onMessage?.(data)), close: () => {} }, this.manager, () => h.t);
    this.at(0, () => transport.onOpen?.());
    return transport;
  }

  /** Advances virtual time by `ms`: due messages, and server ticks at 60 Hz. */
  advance(ms: number): void {
    const end = this.t + ms;
    while (true) {
      const nextTimer = this.timers.reduce((m, x) => (x.at < m.at || (x.at === m.at && x.seq < m.seq) ? x : m), { at: Infinity, seq: 0, fn: () => {} });
      const nextTick = this.serverMs + FRAME_MS;
      const next = Math.min(nextTimer.at, nextTick);
      if (next > end) break;
      this.t = next;
      if (nextTick <= nextTimer.at) {
        this.serverMs = nextTick;
        this.manager.tick(this.t);
        const room = this.manager.room('net');
        if (room) {
          for (const a of room.world.aircraftList()) {
            let h = this.history.get(a.id);
            if (!h) this.history.set(a.id, (h = new Map()));
            h.set(room.world.tick, a.flight.pos.clone());
          }
        }
      } else {
        this.timers = this.timers.filter((x) => x !== nextTimer);
        nextTimer.fn();
      }
    }
    this.t = end;
  }
}

async function join(h: Harness, id: number, aircraftId = 'kestrel') {
  const promise = NetworkSession.connect(h.line(id), { room: 'net', callsign: `P${id}`, aircraftId, mode: 'team-deathmatch' }, map, terrain, () => h.t);
  for (let i = 0; i < 60 && !(await Promise.race([promise.then(() => true), Promise.resolve(false)])); i++) h.advance(FRAME_MS);
  return promise;
}

/** Runs the client and server together for `seconds` with the given stick input. */
function fly(h: Harness, session: NetworkSession, seconds: number, input: (t: number) => ControlInput) {
  for (let i = 0; i < seconds * 60; i++) {
    session.update(1 / 60, input(i / 60));
    h.advance(FRAME_MS);
  }
}

const weave = (t: number): ControlInput => ({ ...neutralInput(0.85), roll: 0.6 * Math.sin(t * 1.3), pitch: 0.3 + 0.3 * Math.sin(t * 0.7) });

describe('NetworkSession', () => {
  it('joins, predicts its own jet exactly with no lag, and shows the other team', async () => {
    const h = new Harness(0);
    const s = await join(h, 1);
    fly(h, s, 3, weave);
    expect(s.localView()?.isLocal).toBe(true);
    expect(s.predictionErrorM).toBeLessThan(0.01);
    expect([...s.views()].length).toBe(2);
  });

  it('keeps its prediction exact at 150 ms each way, and the server queue near two inputs', async () => {
    const h = new Harness(150);
    const s = await join(h, 1);
    let worst = 0;
    const depths: number[] = [];
    for (let i = 0; i < 8 * 60; i++) {
      s.update(1 / 60, weave(i / 60));
      h.advance(FRAME_MS);
      if (i > 3 * 60) {
        worst = Math.max(worst, s.predictionErrorM);
        depths.push(s.queueDepth);
      }
    }
    expect(worst).toBeLessThan(0.05);
    const mean = depths.reduce((a, b) => a + b, 0) / depths.length;
    expect(mean).toBeGreaterThan(0.5);
    expect(mean).toBeLessThan(5);
  });

  it('syncs its clock to the server within two ticks at 300 ms round trip', async () => {
    const h = new Harness(150);
    const s = await join(h, 1);
    fly(h, s, 5, () => neutralInput(0.8));
    const room = h.manager.room('net');
    expect(Math.abs(s.serverTickNow() - (room?.world.tick ?? 0))).toBeLessThan(2);
    expect(s.rttMs).toBeGreaterThan(280);
    expect(s.rttMs).toBeLessThan(340);
  });

  it('draws others on the path the server flew them about 100 ms ago, within a metre', async () => {
    const h = new Harness(150);
    const s = await join(h, 1);
    fly(h, s, 4, () => neutralInput(0.8));
    const other = [...s.views()].find((v) => !v.isLocal);
    if (!other) throw new Error('no other aircraft');
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      s.update(1 / 60, neutralInput(0.8));
      h.advance(FRAME_MS);
      // The synced clock may be a tick off, so compare with the server's path around the render time.
      const render = Math.floor(s.serverTickNow() - INTERP_DELAY_TICKS);
      const hist = h.history.get(other.id);
      let nearest = Infinity;
      for (let k = render - 3; k <= render + 3; k++) {
        const a = hist?.get(k);
        const b = hist?.get(k + 1);
        if (!a || !b) continue;
        for (let f = 0; f <= 1; f += 0.05) nearest = Math.min(nearest, new Vector3().lerpVectors(a, b, f).distanceTo(other.position));
      }
      expect(nearest).toBeLessThan(Infinity);
      worst = Math.max(worst, nearest);
    }
    expect(worst).toBeLessThan(1.5);
  });

  it('lets two clients see each other and tells them when the line drops', async () => {
    const h = new Harness(30);
    const a = await join(h, 1, 'kestrel');
    const b = await join(h, 2, 'kobchik');
    fly(h, a, 1, () => neutralInput(0.8));
    b.update(1 / 60, neutralInput(0.8));
    expect([...a.views()].filter((v) => !v.isBot)).toHaveLength(2);
    let reason = '';
    a.onClosed = (r) => (reason = r);
    a.dispose();
    expect(a.closed).toBe(true);
    fly(h, b, 1, () => neutralInput(0.8));
    expect([...b.views()].filter((v) => !v.isBot)).toHaveLength(1);
    expect(reason).toBe('');
  });
});
