import { describe, expect, it } from 'vitest';
import { neutralInput } from '../physics/controls.ts';
import { decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, INPUT_BYTES, quantizeInput, type Snapshot, snapshotBytes } from './codec.ts';
import { ProtocolError } from './protocol.ts';

const snapshot = (): Snapshot => ({
  tick: 123456,
  ackSeq: 9876,
  queueDepth: 3,
  aircraft: [
    { id: 1, alive: true, firingCannon: true, gearDown: true, onGround: false, spawnGen: 300, hp: 62.5, throttle: 0.95, pos: [-7512.25, 3012.5, 40.75], quat: [0.1, 0.7, -0.1, 0.7], vel: [251.3, -4.2, 0.05] },
    { id: 9, alive: false, firingCannon: false, gearDown: false, onGround: true, spawnGen: 2, hp: 0, throttle: 0, pos: [0, 0, 0], quat: [0, 0, 0, 1], vel: [0, 0, 0] },
  ],
  missiles: [
    { id: 4, kind: 'dart', ownerId: 1, targetId: 9, motorBurning: true, team: 'usa', pos: [10, 20, 30], vel: [800, 0, -12.3] },
    { id: 5, kind: 'lance', ownerId: 9, targetId: 1, motorBurning: false, team: 'russia', pos: [10, 20, 30], vel: [900, 0, 0] },
  ],
  bombs: [{ id: 2, team: 'russia', pos: [5, 1500, -5], vel: [200, -30, 0] }],
  targets: [
    { hpFraction: 1, destroyed: false },
    { hpFraction: 0, destroyed: true },
  ],
  own: {
    pos: [-7512.123, 3012.456, 40.789],
    vel: [251.3, -4.2, 0.05],
    angVel: [0.01, -0.2, 0.3],
    quat: [0.1, 0.7, -0.1, 0.7],
    throttle: 0.95,
    airbrake: 0.25,
    hp: 62.5,
    cannonRounds: 433,
    srm: 3,
    mrm: 2,
    countermeasures: 38,
    bombs: 0,
    seekerMode: 'track',
    seekerTargetId: 9,
    seekerAxis: [0, 0, -1],
    radarLockMode: 'tracking',
    radarLockTargetId: 9,
    gear: 0.5,
    onGround: true,
    radarLockProgress: 0.4,
    lockedByRadar: true,
    targetId: 9,
    outOfBoundsTicks: 0,
    contacts: [{ id: 9, visual: true, radar: false, rangeM: 3500.5, offNoseRad: 0.25 }],
  },
});

describe('input codec', () => {
  it('packs an input into 17 bytes and back within quantization', () => {
    const input = { ...neutralInput(0.93), pitch: 0.5, roll: -1, yaw: 0.25, fireCannon: true, fireMissile: true, weapon: 'mrm' as const, lookYaw: 2.5, lookPitch: -0.7 };
    const buf = encodeInput(77, input, 6);
    expect(buf.byteLength).toBe(INPUT_BYTES);
    const out = decodeInput(buf);
    expect(out.seq).toBe(77);
    expect(out.viewDelay).toBe(6);
    expect(out.input.pitch).toBeCloseTo(0.5, 2);
    expect(out.input.roll).toBe(-1);
    expect(out.input.throttle).toBeCloseTo(0.93, 2);
    expect(out.input.fireCannon && out.input.fireMissile).toBe(true);
    expect(out.input.countermeasures || out.input.dropBomb || out.input.airbrake).toBe(false);
    expect(out.input.weapon).toBe('mrm');
    expect(out.input.lookYaw).toBeCloseTo(2.5, 3);
    expect(out.input.lookPitch).toBeCloseTo(-0.7, 3);
  });

  it('quantizes the same way on both sides, so prediction uses what the server will see', () => {
    const input = { ...neutralInput(0.333), pitch: 0.123456 };
    const q = quantizeInput(input);
    expect(decodeInput(encodeInput(1, q, 0)).input).toEqual(q);
  });

  it('clamps wild values instead of wrapping', () => {
    const out = decodeInput(encodeInput(1, { ...neutralInput(5), pitch: 9, roll: Number.NaN, lookYaw: 100 }, 99999)).input;
    expect(out.pitch).toBe(1);
    expect(out.roll).toBe(0);
    expect(out.throttle).toBe(1);
    expect(out.lookYaw).toBeCloseTo(Math.PI, 3);
  });

  it('rejects garbage with a ProtocolError', () => {
    expect(() => decodeInput(new ArrayBuffer(5))).toThrow(ProtocolError);
    const wrongKind = new Uint8Array(INPUT_BYTES);
    wrongKind[0] = 9;
    expect(() => decodeInput(wrongKind.buffer)).toThrow(ProtocolError);
  });
});

describe('snapshot codec', () => {
  it('round-trips every field within its quantization', () => {
    const s = snapshot();
    const buf = encodeSnapshot(s);
    expect(buf.byteLength).toBe(snapshotBytes(s));
    const d = decodeSnapshot(buf);
    expect([d.tick, d.ackSeq, d.queueDepth]).toEqual([123456, 9876, 3]);
    const a = d.aircraft[0];
    expect(a.id).toBe(1);
    expect(a.alive && a.firingCannon).toBe(true);
    expect(a.spawnGen).toBe(300 % 256);
    expect(a.hp).toBeCloseTo(62.5, 1);
    expect(a.throttle).toBeCloseTo(0.95, 2);
    a.pos.forEach((v, i) => expect(v).toBeCloseTo(s.aircraft[0].pos[i], 2));
    a.vel.forEach((v, i) => expect(Math.abs(v - s.aircraft[0].vel[i])).toBeLessThanOrEqual(0.05));
    const qLen = Math.hypot(...a.quat);
    expect(qLen).toBeCloseTo(1, 4);
    expect(d.aircraft[1].alive).toBe(false);
    expect(d.missiles[0]).toMatchObject({ id: 4, kind: 'dart', ownerId: 1, targetId: 9, motorBurning: true, team: 'usa' });
    expect(d.missiles[1]).toMatchObject({ id: 5, kind: 'lance', ownerId: 9, targetId: 1, motorBurning: false, team: 'russia' });
    expect(d.bombs[0]).toMatchObject({ id: 2, team: 'russia' });
    expect(d.targets[1]).toEqual({ hpFraction: 0, destroyed: true });
    const own = d.own;
    if (!own) throw new Error('own section missing');
    own.pos.forEach((v, i) => expect(v).toBeCloseTo(s.own?.pos[i] ?? 0, 2));
    expect(own.seekerMode).toBe('track');
    expect(own.cannonRounds).toBe(433);
    expect(own.contacts[0]).toMatchObject({ id: 9, visual: true, radar: false });
    expect(own.targetId).toBe(9);
    expect(own).toMatchObject({ radarLockMode: 'tracking', radarLockTargetId: 9, lockedByRadar: true });
    expect(own.radarLockProgress).toBeCloseTo(0.4, 2);
  });

  it('marks missing ids as null and works without the own section', () => {
    const s = snapshot();
    s.missiles[0].targetId = null;
    s.own = null;
    const d = decodeSnapshot(encodeSnapshot(s));
    expect(d.missiles[0].targetId).toBeNull();
    expect(d.own).toBeNull();
  });

  it('stays within the bandwidth budget: about 34 bytes per jet', () => {
    const s = snapshot();
    const one = snapshotBytes({ ...s, aircraft: [s.aircraft[0]] });
    const two = snapshotBytes(s);
    expect(two - one).toBeLessThanOrEqual(36);
  });

  it('rejects truncated snapshots', () => {
    const buf = encodeSnapshot(snapshot());
    expect(() => decodeSnapshot(buf.slice(0, 20))).toThrow(ProtocolError);
  });
});
