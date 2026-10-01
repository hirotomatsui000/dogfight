import { beforeAll, describe, expect, it } from 'vitest';
import { buildTerrain, type MapDefinition } from '../shared/data/maps/map-definition.ts';
import { createTestRange } from '../shared/data/maps/test-range.ts';
import type { GridTerrain } from '../shared/map/terrain.ts';
import { decodeSnapshot, encodeInput, decodeInput, type Snapshot } from '../shared/net/codec.ts';
import { type HelloMessage, PROTOCOL_VERSION, type ServerJsonMessage } from '../shared/net/protocol.ts';
import { neutralInput } from '../shared/physics/controls.ts';
import { CALM_NOON } from '../shared/world/time-of-day.ts';
import { type Peer, Room, type RoomOptions } from './room.ts';

let map: MapDefinition;
let terrain: GridTerrain;
beforeAll(() => {
  map = createTestRange(1);
  terrain = buildTerrain(map);
});

class FakePeer implements Peer {
  readonly id: number;
  json: ServerJsonMessage[] = [];
  snapshots: Snapshot[] = [];
  closed = false;
  constructor(id: number) {
    this.id = id;
  }
  sendJson(msg: ServerJsonMessage): void {
    this.json.push(msg);
  }
  sendBinary(buf: ArrayBuffer): void {
    this.snapshots.push(decodeSnapshot(buf));
  }
  close(): void {
    this.closed = true;
  }
  last<T extends ServerJsonMessage['type']>(type: T): Extract<ServerJsonMessage, { type: T }> | undefined {
    return this.json.filter((m): m is Extract<ServerJsonMessage, { type: T }> => m.type === type).at(-1);
  }
}

const hello = (aircraftId = 'kestrel', callsign = 'Ace'): HelloMessage => ({
  type: 'hello',
  version: PROTOCOL_VERSION,
  room: 'test',
  callsign,
  aircraftId,
  mode: 'team-deathmatch',
  map: 'test-range',
  environment: CALM_NOON,
  start: 'air',
});
const options = (over: Partial<RoomOptions> = {}): RoomOptions => ({ name: 'test', mode: 'team-deathmatch', teamSize: 4, botSkill: 'veteran', maxHumans: 2, build: 'test', seed: 5, restartDelayS: 2, ...over });
const input = (seq: number, over: Partial<ReturnType<typeof neutralInput>> = {}) => decodeInput(encodeInput(seq, { ...neutralInput(0.8), ...over }, 3));

describe('Room', () => {
  it('welcomes a pilot into the team of the jet they chose and fills both teams with bots', () => {
    const room = new Room(options(), map, terrain);
    const p = new FakePeer(1);
    expect(room.join(p, hello('kobchik'))).toEqual({ ok: true });
    const welcome = p.last('welcome');
    expect(welcome?.you).toBeGreaterThan(0);
    const me = room.world.getAircraft(welcome?.you ?? -1);
    expect(me?.team).toBe('russia');
    expect(me?.isBot).toBe(false);
    const roster = p.last('roster')?.players ?? [];
    expect(roster.filter((r) => r.team === 'russia')).toHaveLength(4);
    expect(roster.filter((r) => r.team === 'usa')).toHaveLength(4);
    expect(roster.filter((r) => r.isBot)).toHaveLength(7);
    expect(roster.find((r) => !r.isBot)?.callsign).toBe('Ace');
  });

  it('refuses unknown jets and a full room', () => {
    const room = new Room(options({ maxHumans: 1 }), map, terrain);
    expect(room.join(new FakePeer(1), hello('f-22')).ok).toBe(false);
    expect(room.join(new FakePeer(2), hello()).ok).toBe(true);
    expect(room.join(new FakePeer(3), hello()).ok).toBe(false);
  });

  it('applies one queued input per tick and acknowledges it in the snapshot', () => {
    const room = new Room(options(), map, terrain);
    const p = new FakePeer(1);
    room.join(p, hello());
    const you = p.last('welcome')?.you ?? -1;
    room.receiveInput(p.id, input(10, { throttle: 1 }));
    room.receiveInput(p.id, input(11, { throttle: 1 }));
    room.tick();
    room.tick();
    const snap = p.snapshots.at(-1);
    expect(snap?.ackSeq).toBe(11);
    expect(snap?.queueDepth).toBe(0);
    expect(room.world.getAircraft(you)?.input.throttle).toBe(1);
    expect(room.world.getAircraft(you)?.viewDelayTicks).toBe(3);
    expect(snap?.own?.pos[0]).toBeCloseTo(room.world.getAircraft(you)?.flight.pos.x ?? 0, 0);
    expect(snap?.aircraft).toHaveLength(8);
  });

  it('repeats the last input without its presses when the queue runs dry', () => {
    const room = new Room(options(), map, terrain);
    const p = new FakePeer(1);
    room.join(p, hello());
    const you = p.last('welcome')?.you ?? -1;
    room.receiveInput(p.id, input(1, { throttle: 0.3, fireMissile: true, fireCannon: true }));
    room.tick();
    room.tick();
    const a = room.world.getAircraft(you);
    expect(a?.input.throttle).toBeCloseTo(0.3, 2);
    expect(a?.input.fireCannon).toBe(true);
    expect(a?.input.fireMissile).toBe(false);
  });

  it('keeps at most 30 inputs queued, dropping the oldest', () => {
    const room = new Room(options(), map, terrain);
    const p = new FakePeer(1);
    room.join(p, hello());
    for (let s = 1; s <= 40; s++) room.receiveInput(p.id, input(s));
    room.tick();
    room.tick();
    expect(p.snapshots.at(-1)?.ackSeq).toBe(12);
    expect(p.snapshots.at(-1)?.queueDepth).toBe(28);
  });

  it('sends snapshots at 30 Hz with the events of the ticks in between', () => {
    const room = new Room(options(), map, terrain);
    const p = new FakePeer(1);
    room.join(p, hello());
    for (let t = 0; t < 60; t++) room.tick();
    expect(p.snapshots.length).toBe(30);
    expect(p.json.some((m) => m.type === 'status')).toBe(true);
  });

  it('gives a leaving pilot\'s seat back to a bot', () => {
    const room = new Room(options(), map, terrain);
    const a = new FakePeer(1);
    const b = new FakePeer(2);
    room.join(a, hello('kestrel', 'A'));
    room.join(b, hello('kestrel', 'B'));
    expect([...room.world.aircraftList()].filter((x) => x.team === 'usa' && x.isBot)).toHaveLength(2);
    room.leave(b.id);
    expect(room.humanCount).toBe(1);
    expect([...room.world.aircraftList()].filter((x) => x.team === 'usa' && x.isBot)).toHaveLength(3);
    const roster = a.last('roster')?.players ?? [];
    expect(roster.some((r) => r.callsign === 'B')).toBe(false);
  });

  it('relays quick chat to everyone', () => {
    const room = new Room(options(), map, terrain);
    const a = new FakePeer(1);
    const b = new FakePeer(2);
    room.join(a, hello('kestrel', 'A'));
    room.join(b, hello('kobchik', 'B'));
    room.chat(a.id, 2);
    expect(b.last('chat')).toEqual({ type: 'chat', from: a.last('welcome')?.you, index: 2 });
  });

  it('ends the match, waits, and starts a new one with the same pilots', () => {
    const room = new Room(options({ tdmScoreLimit: 1, restartDelayS: 1 }), map, terrain);
    const p = new FakePeer(1);
    room.join(p, hello());
    const you = p.last('welcome')?.you ?? -1;
    const me = room.world.getAircraft(you);
    if (!me) throw new Error('no jet');
    room.world.applyDamage(me, 9999, null, 'cannon');
    room.tick();
    room.tick();
    expect(p.last('matchEnd')?.status.winner).toBe('russia');
    for (let t = 0; t < 70; t++) room.tick();
    const start = p.last('matchStart');
    expect(start).toBeDefined();
    const fresh = room.world.getAircraft(start?.you ?? -1);
    expect(fresh?.alive).toBe(true);
    expect(fresh?.callsign).toBe('Ace');
    expect(room.world.mode.status(room.world).winner).toBeNull();
  });

  it('gives each Strike team four aircraft per pilot', () => {
    const room = new Room(options({ mode: 'strike' }), map, terrain);
    room.join(new FakePeer(1), { ...hello('kobchik'), mode: 'strike' });
    expect(room.world.mode.status(room.world).strike?.aircraftLeft).toEqual({ usa: 16, russia: 16 });
  });

  it('runs Air Superiority and Team Objective rooms; Sentinels never count as seat-filling bots (M5)', () => {
    const as = new Room(options({ mode: 'air-superiority' }), map, terrain);
    const a = new FakePeer(1);
    as.join(a, { ...hello(), mode: 'air-superiority' });
    as.tick();
    as.tick();
    expect(a.last('status')?.status.zones).toHaveLength(3);
    expect(a.last('welcome')?.modeId).toBe('air-superiority');

    const to = new Room(options({ mode: 'team-objective' }), map, terrain);
    const p = new FakePeer(2);
    const q = new FakePeer(3);
    to.join(p, { ...hello(), mode: 'team-objective' });
    to.join(q, { ...hello('kobchik', 'Two'), mode: 'team-objective' });
    const roster = q.last('roster')?.players ?? [];
    expect(roster.filter((r) => r.aircraftId.startsWith('sentinel'))).toHaveLength(4);
    expect(roster.filter((r) => !r.aircraftId.startsWith('sentinel') && r.team === 'usa')).toHaveLength(4);
    expect(roster.filter((r) => !r.aircraftId.startsWith('sentinel') && r.team === 'russia')).toHaveLength(4);
    to.leave(2);
    expect([...to.world.aircraftList()].filter((x) => x.support)).toHaveLength(4);
    to.tick();
    to.tick();
    expect(q.snapshots.at(-1)?.own?.datalink).toBeDefined();
  });

  it('flies the chosen jet after the next respawn and in the next match (M5)', () => {
    const room = new Room(options({ tdmScoreLimit: 50 }), map, terrain);
    const p = new FakePeer(1);
    room.join(p, hello('kestrel'));
    const me = room.world.getAircraft(p.last('welcome')?.you ?? -1)!;
    room.chooseJet(1, 'kobchik');
    expect(me.nextAircraftId).toBeNull();
    room.chooseJet(1, 'condor');
    room.world.applyDamage(me, 9999, null, 'cannon');
    for (let t = 0; t < 6 * 60; t++) room.tick();
    expect(me.alive).toBe(true);
    expect(me.config.id).toBe('condor');
    expect(p.last('roster')?.players.find((r) => r.id === me.id)?.aircraftId).toBe('condor');
  });

  it('Free Flight rooms have no bots, take weather and fly-from requests and tell everyone (M5)', () => {
    const room = new Room(options({ mode: 'free-flight' }), map, terrain);
    const a = new FakePeer(1);
    const b = new FakePeer(2);
    room.join(a, { ...hello(), mode: 'free-flight' });
    room.join(b, { ...hello('kobchik', 'Two'), mode: 'free-flight' });
    expect(b.last('roster')?.players.filter((r) => r.isBot)).toHaveLength(0);
    for (let t = 0; t < 120; t++) room.tick();
    room.changeWorld(2, 'overcast', 21, true);
    expect(a.last('environment')?.environment.weather).toBe('overcast');
    expect(room.world.hour()).toBeCloseTo(21, 6);
    const jet = room.world.getAircraft(a.last('welcome')?.you ?? -1)!;
    room.flyFrom(1, 6000, -9000);
    expect(jet.flight.pos.x).toBeCloseTo(6000, 0);
    // Only in Free Flight.
    const tdm = new Room(options(), map, terrain);
    const c = new FakePeer(3);
    tdm.join(c, hello());
    tdm.changeWorld(3, 'rain', 3, false);
    expect(c.last('environment')).toBeUndefined();
    expect(tdm.world.environment.weather).toBe('clear');
  });
});
