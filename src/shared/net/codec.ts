import type { TeamId } from '../data/aircraft/types.ts';
import { type ControlInput, neutralInput, sanitizeInput } from '../physics/controls.ts';
import type { SeekerMode } from '../targeting/ir-seeker.ts';
import { ProtocolError } from './protocol.ts';

/** Binary message kinds (first byte). */
export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;
export const INPUT_BYTES = 17;
const NONE = 0xffff;

type V3 = [number, number, number];
type Q4 = [number, number, number, number];

export interface DecodedInput {
  seq: number;
  input: ControlInput;
  viewDelay: number;
}

const BUTTONS = ['airbrake', 'fireCannon', 'fireMissile', 'countermeasures', 'dropBomb', 'cycleTarget'] as const;
const BIT_MRM = 1 << 6;
const BIT_HELMET = 1 << 7;
const LOOK_YAW_SCALE = 32767 / Math.PI;
const LOOK_PITCH_SCALE = 32767 / (Math.PI / 2);

const clampInt = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);

/** Client → server: one tick of pilot input (spec §7, plan M2). */
export function encodeInput(seq: number, raw: ControlInput, viewDelay: number): ArrayBuffer {
  const input = sanitizeInput(raw);
  const buf = new ArrayBuffer(INPUT_BYTES);
  const v = new DataView(buf);
  v.setUint8(0, MSG_INPUT);
  v.setUint32(1, seq >>> 0, true);
  v.setInt8(5, clampInt(input.pitch * 127, -127, 127));
  v.setInt8(6, clampInt(input.roll * 127, -127, 127));
  v.setInt8(7, clampInt(input.yaw * 127, -127, 127));
  v.setUint8(8, clampInt(input.throttle * 255, 0, 255));
  let bits = 0;
  BUTTONS.forEach((b, i) => {
    if (input[b]) bits |= 1 << i;
  });
  if (input.weapon === 'mrm') bits |= BIT_MRM;
  if (input.helmetSight) bits |= BIT_HELMET;
  v.setUint16(9, bits, true);
  v.setInt16(11, clampInt(input.lookYaw * LOOK_YAW_SCALE, -32767, 32767), true);
  v.setInt16(13, clampInt(input.lookPitch * LOOK_PITCH_SCALE, -32767, 32767), true);
  v.setUint16(15, clampInt(viewDelay, 0, 0xffff), true);
  return buf;
}

export function decodeInput(buf: ArrayBuffer, out: ControlInput = neutralInput()): DecodedInput {
  if (buf.byteLength !== INPUT_BYTES) throw new ProtocolError(`input must be ${INPUT_BYTES} bytes, got ${buf.byteLength}`);
  const v = new DataView(buf);
  if (v.getUint8(0) !== MSG_INPUT) throw new ProtocolError('not an input message');
  const bits = v.getUint16(9, true);
  out.pitch = v.getInt8(5) / 127;
  out.roll = v.getInt8(6) / 127;
  out.yaw = v.getInt8(7) / 127;
  out.throttle = v.getUint8(8) / 255;
  BUTTONS.forEach((b, i) => {
    out[b] = (bits & (1 << i)) !== 0;
  });
  out.weapon = bits & BIT_MRM ? 'mrm' : 'srm';
  out.helmetSight = (bits & BIT_HELMET) !== 0;
  out.lookYaw = v.getInt16(11, true) / LOOK_YAW_SCALE;
  out.lookPitch = v.getInt16(13, true) / LOOK_PITCH_SCALE;
  return { seq: v.getUint32(1, true), input: out, viewDelay: v.getUint16(15, true) };
}

/** The input exactly as the server will decode it, for the client's own prediction. */
export function quantizeInput(input: ControlInput, out: ControlInput = neutralInput()): ControlInput {
  return decodeInput(encodeInput(0, input, 0), out).input;
}

export interface SnapshotAircraft {
  id: number;
  alive: boolean;
  firingCannon: boolean;
  /** modulo 256 on the wire */
  spawnGen: number;
  hp: number;
  throttle: number;
  pos: V3;
  quat: Q4;
  vel: V3;
}

export interface SnapshotMissile {
  id: number;
  ownerId: number;
  targetId: number | null;
  motorBurning: boolean;
  team: TeamId;
  pos: V3;
  vel: V3;
}

export interface SnapshotBomb {
  id: number;
  team: TeamId;
  pos: V3;
  vel: V3;
}

export interface SnapshotTarget {
  /** 0..1 */
  hpFraction: number;
  destroyed: boolean;
}

export interface SnapshotContact {
  id: number;
  visual: boolean;
  radar: boolean;
  rangeM: number;
  offNoseRad: number;
}

/** The receiving player's own jet at full precision, for reconciliation and the HUD. */
export interface OwnState {
  pos: V3;
  vel: V3;
  angVel: V3;
  quat: Q4;
  throttle: number;
  airbrake: number;
  hp: number;
  cannonRounds: number;
  srm: number;
  mrm: number;
  countermeasures: number;
  bombs: number;
  seekerMode: SeekerMode;
  seekerTargetId: number | null;
  seekerAxis: V3;
  targetId: number | null;
  outOfBoundsTicks: number;
  contacts: SnapshotContact[];
}

export interface Snapshot {
  tick: number;
  /** the last input sequence the server applied for this client */
  ackSeq: number;
  /** inputs waiting on the server for this client */
  queueDepth: number;
  aircraft: SnapshotAircraft[];
  missiles: SnapshotMissile[];
  bombs: SnapshotBomb[];
  targets: SnapshotTarget[];
  own: OwnState | null;
}

const SEEKER_MODES: readonly SeekerMode[] = ['off', 'search', 'track', 'locked'];
const HEADER = 1 + 4 + 4 + 1;
const AIRCRAFT_BYTES = 2 + 1 + 1 + 2 + 1 + 12 + 8 + 6;
const MISSILE_BYTES = 2 + 2 + 2 + 1 + 12 + 6;
const BOMB_BYTES = 2 + 1 + 12 + 6;
const TARGET_BYTES = 2;
const OWN_FIXED = 12 * 3 + 16 + 4 + 4 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 2 + 12 + 2 + 2 + 1;
const CONTACT_BYTES = 2 + 1 + 4 + 4;
const MAX_LIST = 255;

export function snapshotBytes(s: Snapshot): number {
  const own = s.own ? OWN_FIXED + CONTACT_BYTES * Math.min(s.own.contacts.length, MAX_LIST) : 0;
  return (
    HEADER +
    1 +
    AIRCRAFT_BYTES * Math.min(s.aircraft.length, MAX_LIST) +
    1 +
    MISSILE_BYTES * Math.min(s.missiles.length, MAX_LIST) +
    1 +
    BOMB_BYTES * Math.min(s.bombs.length, MAX_LIST) +
    1 +
    TARGET_BYTES * Math.min(s.targets.length, MAX_LIST) +
    1 +
    own
  );
}

const teamByte = (t: TeamId) => (t === 'russia' ? 1 : 0);
const byteTeam = (b: number): TeamId => (b === 1 ? 'russia' : 'usa');

/** Server → client: the world as this client should see it (spec §7, plan M2). */
export function encodeSnapshot(s: Snapshot): ArrayBuffer {
  const buf = new ArrayBuffer(snapshotBytes(s));
  const v = new DataView(buf);
  let o = 0;
  const u8 = (x: number) => v.setUint8(o++, clampInt(x, 0, 255));
  const u16 = (x: number) => {
    v.setUint16(o, clampInt(x, 0, 0xffff), true);
    o += 2;
  };
  const u32 = (x: number) => {
    v.setUint32(o, x >>> 0, true);
    o += 4;
  };
  const i16 = (x: number) => {
    v.setInt16(o, clampInt(x, -32767, 32767), true);
    o += 2;
  };
  const f32 = (x: number) => {
    v.setFloat32(o, Number.isFinite(x) ? x : 0, true);
    o += 4;
  };
  const vec = (a: readonly number[]) => a.forEach(f32);
  const vel = (a: readonly number[]) => a.forEach((x) => i16(x * 10));
  const id = (x: number | null) => u16(x === null ? NONE : x);

  u8(MSG_SNAPSHOT);
  u32(s.tick);
  u32(s.ackSeq);
  u8(s.queueDepth);
  const aircraft = s.aircraft.slice(0, MAX_LIST);
  u8(aircraft.length);
  for (const a of aircraft) {
    u16(a.id);
    u8((a.alive ? 1 : 0) | (a.firingCannon ? 2 : 0));
    u8(a.spawnGen % 256);
    u16(a.hp * 10);
    u8(a.throttle * 255);
    vec(a.pos);
    a.quat.forEach((q) => i16(q * 32767));
    vel(a.vel);
  }
  const missiles = s.missiles.slice(0, MAX_LIST);
  u8(missiles.length);
  for (const m of missiles) {
    u16(m.id);
    u16(m.ownerId);
    id(m.targetId);
    u8((m.motorBurning ? 1 : 0) | (teamByte(m.team) << 1));
    vec(m.pos);
    vel(m.vel);
  }
  const bombs = s.bombs.slice(0, MAX_LIST);
  u8(bombs.length);
  for (const b of bombs) {
    u16(b.id);
    u8(teamByte(b.team));
    vec(b.pos);
    vel(b.vel);
  }
  const targets = s.targets.slice(0, MAX_LIST);
  u8(targets.length);
  for (const t of targets) {
    u8(t.hpFraction * 255);
    u8(t.destroyed ? 1 : 0);
  }
  u8(s.own ? 1 : 0);
  if (s.own) {
    const w = s.own;
    vec(w.pos);
    vec(w.vel);
    vec(w.angVel);
    w.quat.forEach(f32);
    f32(w.throttle);
    f32(w.airbrake);
    u16(w.hp * 10);
    u16(w.cannonRounds);
    u8(w.srm);
    u8(w.mrm);
    u8(w.countermeasures);
    u8(w.bombs);
    u8(Math.max(0, SEEKER_MODES.indexOf(w.seekerMode)));
    id(w.seekerTargetId);
    vec(w.seekerAxis);
    id(w.targetId);
    u16(w.outOfBoundsTicks);
    const contacts = w.contacts.slice(0, MAX_LIST);
    u8(contacts.length);
    for (const c of contacts) {
      u16(c.id);
      u8((c.visual ? 1 : 0) | (c.radar ? 2 : 0));
      f32(c.rangeM);
      f32(c.offNoseRad);
    }
  }
  return buf;
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot {
  const v = new DataView(buf);
  let o = 0;
  const need = (n: number) => {
    if (o + n > buf.byteLength) throw new ProtocolError('truncated snapshot');
  };
  const u8 = () => {
    need(1);
    return v.getUint8(o++);
  };
  const u16 = () => {
    need(2);
    const x = v.getUint16(o, true);
    o += 2;
    return x;
  };
  const u32 = () => {
    need(4);
    const x = v.getUint32(o, true);
    o += 4;
    return x;
  };
  const i16 = () => {
    need(2);
    const x = v.getInt16(o, true);
    o += 2;
    return x;
  };
  const f32 = () => {
    need(4);
    const x = v.getFloat32(o, true);
    o += 4;
    return x;
  };
  const vec = (): V3 => [f32(), f32(), f32()];
  const vel = (): V3 => [i16() / 10, i16() / 10, i16() / 10];
  const id = () => {
    const x = u16();
    return x === NONE ? null : x;
  };
  const quat = (): Q4 => {
    const q: Q4 = [i16() / 32767, i16() / 32767, i16() / 32767, i16() / 32767];
    const len = Math.hypot(...q) || 1;
    return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
  };

  if (u8() !== MSG_SNAPSHOT) throw new ProtocolError('not a snapshot');
  const tick = u32();
  const ackSeq = u32();
  const queueDepth = u8();
  const aircraft: SnapshotAircraft[] = [];
  for (let n = u8(); n > 0; n--) {
    const idv = u16();
    const flags = u8();
    aircraft.push({ id: idv, alive: (flags & 1) !== 0, firingCannon: (flags & 2) !== 0, spawnGen: u8(), hp: u16() / 10, throttle: u8() / 255, pos: vec(), quat: quat(), vel: vel() });
  }
  const missiles: SnapshotMissile[] = [];
  for (let n = u8(); n > 0; n--) {
    const idv = u16();
    const ownerId = u16();
    const targetId = id();
    const flags = u8();
    missiles.push({ id: idv, ownerId, targetId, motorBurning: (flags & 1) !== 0, team: byteTeam(flags >> 1), pos: vec(), vel: vel() });
  }
  const bombs: SnapshotBomb[] = [];
  for (let n = u8(); n > 0; n--) bombs.push({ id: u16(), team: byteTeam(u8()), pos: vec(), vel: vel() });
  const targets: SnapshotTarget[] = [];
  for (let n = u8(); n > 0; n--) targets.push({ hpFraction: u8() / 255, destroyed: u8() === 1 });
  let own: OwnState | null = null;
  if (u8() === 1) {
    const pos = vec();
    const velocity = vec();
    const angVel = vec();
    const q: Q4 = [f32(), f32(), f32(), f32()];
    const throttle = f32();
    const airbrake = f32();
    const hp = u16() / 10;
    const cannonRounds = u16();
    const srm = u8();
    const mrm = u8();
    const countermeasures = u8();
    const bombsLeft = u8();
    const seekerMode = SEEKER_MODES[u8()] ?? 'off';
    const seekerTargetId = id();
    const seekerAxis = vec();
    const targetId = id();
    const outOfBoundsTicks = u16();
    const contacts: SnapshotContact[] = [];
    for (let n = u8(); n > 0; n--) {
      const cid = u16();
      const flags = u8();
      contacts.push({ id: cid, visual: (flags & 1) !== 0, radar: (flags & 2) !== 0, rangeM: f32(), offNoseRad: f32() });
    }
    own = { pos, vel: velocity, angVel, quat: q, throttle, airbrake, hp, cannonRounds, srm, mrm, countermeasures, bombs: bombsLeft, seekerMode, seekerTargetId, seekerAxis, targetId, outOfBoundsTicks, contacts };
  }
  return { tick, ackSeq, queueDepth, aircraft, missiles, bombs, targets, own };
}
