import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createFlightState } from '../../shared/physics/flight-model.ts';
import { DEFAULT_BINDINGS, rebind } from './bindings.ts';
import { ControlMapper, emptySnapshot, type InputSnapshot } from './control-mapper.ts';
import type { PadFrame } from './gamepad.ts';

const northbound = () => createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 200, throttle: 0.8 });
const snap = (over: Partial<InputSnapshot>): InputSnapshot => ({ ...emptySnapshot(), ...over });
const hold = (...codes: string[]) => snap({ keys: new Set(codes) });
/** Feeds `frames` frames of 1/60 s; mouse deltas, wheel and key edges only on the first frame. */
const run = (m: ControlMapper, s: InputSnapshot, frames: number, flight = northbound()) => {
  let out = m.map(s, flight, 1 / 60);
  for (let i = 1; i < frames; i++) out = m.map({ ...s, mouseDX: 0, mouseDY: 0, wheel: 0, pressed: new Set() }, flight, 1 / 60);
  return out;
};

const idlePad = (): PadFrame => ({
  active: true,
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: null,
  throttleRate: 0,
  lookX: 0,
  lookY: 0,
  down: new Set(),
  pressed: new Set(),
});

describe('ControlMapper', () => {
  it('raises and lowers the throttle and clamps it', () => {
    const m = new ControlMapper();
    expect(run(m, hold('ShiftLeft'), 60).throttle).toBeCloseTo(1, 6);
    expect(run(m, hold('KeyZ'), 30).throttle).toBeCloseTo(0.7, 2);
    expect(m.map(snap({ wheel: -100 }), northbound(), 1 / 60).throttle).toBeCloseTo(0.75, 2);
  });

  it('ramps keyboard axes over 0.15 s (9 frames) in direct mode', () => {
    const m = new ControlMapper({ mode: 'direct' });
    expect(run(m, hold('KeyS'), 3).pitch).toBeCloseTo(1 / 3, 2);
    expect(run(m, hold('KeyS'), 18).pitch).toBe(1);
    expect(run(new ControlMapper({ mode: 'direct' }), hold('KeyA'), 18).roll).toBe(-1);
    expect(run(new ControlMapper({ mode: 'direct' }), hold('KeyE'), 18).yaw).toBe(1);
  });

  it('steers toward the mouse aim in mouse-aim mode', () => {
    const m = new ControlMapper({ mouseSensitivity: 0.002 });
    const flight = northbound();
    m.resetAim(flight);
    const out = m.map(snap({ mouseDX: 500 }), flight, 1 / 60);
    expect(m.aimDirection.x).toBeGreaterThan(0.5);
    expect(out.roll).toBeGreaterThan(0.5);
  });

  it('pitches the aim up when the mouse moves up, and honours invertY', () => {
    const m = new ControlMapper({ mouseSensitivity: 0.002 });
    m.resetAim(northbound());
    m.map(snap({ mouseDY: -100 }), northbound(), 1 / 60);
    expect(m.aimDirection.y).toBeGreaterThan(0.1);
    const inv = new ControlMapper({ mouseSensitivity: 0.002, invertY: true });
    inv.resetAim(northbound());
    inv.map(snap({ mouseDY: -100 }), northbound(), 1 / 60);
    expect(inv.aimDirection.y).toBeLessThan(-0.1);
  });

  it('lets the keyboard override the autopilot axis', () => {
    const m = new ControlMapper({ mouseSensitivity: 0.002 });
    m.resetAim(northbound());
    m.map(snap({ mouseDY: -150 }), northbound(), 1 / 60);
    expect(run(m, hold('KeyW'), 18).pitch).toBe(-1);
  });

  it('free look moves the head, not the aim, and eases back when released', () => {
    const m = new ControlMapper({ mouseSensitivity: 0.002 });
    const flight = northbound();
    m.resetAim(flight);
    const before = m.aimDirection.clone();
    const out = m.map(snap({ keys: new Set(['KeyC']), mouseDX: 300 }), flight, 1 / 60);
    expect(out.helmetSight).toBe(true);
    expect(out.lookYaw).toBeGreaterThan(0.5);
    expect(m.aimDirection.distanceTo(before)).toBeLessThan(1e-9);
    run(m, emptySnapshot(), 60, flight);
    expect(Math.abs(m.lookYaw)).toBeLessThan(0.01);
  });

  it('turns the head twice as far per pixel as the aim', () => {
    const m = new ControlMapper({ mouseSensitivity: 0.001 });
    const flight = northbound();
    m.resetAim(flight);
    m.map(snap({ mouseDX: 100 }), flight, 1 / 60);
    const aimYaw = Math.atan2(m.aimDirection.x, -m.aimDirection.z);
    expect(aimYaw).toBeCloseTo(0.1, 6);
    const look = new ControlMapper({ mouseSensitivity: 0.001 });
    expect(look.map(snap({ keys: new Set(['KeyC']), mouseDX: 100 }), flight, 1 / 60).lookYaw).toBeCloseTo(0.2, 6);
  });

  it('recovers from a spin by itself in mouse-aim mode, with the aim on the horizon ahead (revision 16)', () => {
    const m = new ControlMapper();
    const flight = northbound();
    m.resetAim(flight);
    flight.spin = 1;
    const out = m.map(snap({ mouseDX: 400, mouseDY: -400 }), flight, 1 / 60);
    expect(out.pitch).toBeLessThan(0);
    expect(out.roll).toBe(0);
    expect(out.yaw).toBe(-1);
    expect(m.aimDirection.y).toBeCloseTo(0, 6);
    // A held key still wins.
    expect(m.map(snap({ keys: new Set(['KeyS']) }), flight, 1).pitch).toBe(1);
    // Keyboard steering leaves the recovery to the pilot.
    const direct = new ControlMapper({ mode: 'direct' });
    expect(direct.map(snap({}), flight, 1 / 60).yaw).toBe(0);
  });

  it('reports weapon edges and holds', () => {
    const m = new ControlMapper();
    const out = m.map(snap({ keys: new Set(['Space', 'KeyB', 'KeyF']), pressed: new Set(['KeyF', 'KeyG', 'KeyR', 'KeyX', 'Digit2']) }), northbound(), 1 / 60);
    expect(out.fireCannon && out.airbrake && out.fireMissile && out.dropBomb && out.cycleTarget && out.countermeasures).toBe(true);
    expect(out.weapon).toBe('mrm');
    const next = m.map(snap({ keys: new Set(['KeyF']) }), northbound(), 1 / 60);
    expect(next.cycleTarget || next.countermeasures || next.fireMissile || next.dropBomb).toBe(false);
    expect(next.weapon).toBe('mrm');
  });
});

describe('ControlMapper with rebound keys and a gamepad', () => {
  it('follows rebound keys', () => {
    const m = new ControlMapper({ mode: 'direct', bindings: rebind(DEFAULT_BINDINGS, 'pitchUp', 'KeyK') });
    expect(run(m, hold('KeyK'), 18).pitch).toBe(1);
    expect(run(m, hold('KeyS'), 18).pitch).toBe(0);
    const swapped = new ControlMapper({ bindings: rebind(DEFAULT_BINDINGS, 'missile', 'Space') });
    const out = swapped.map(snap({ keys: new Set(['Space']), pressed: new Set(['Space']) }), northbound(), 1 / 60);
    expect(out.fireMissile).toBe(true);
    expect(out.fireCannon).toBe(false);
  });

  it('flies with the pad stick, overriding the mouse aim, and keeps the aim on the nose', () => {
    const m = new ControlMapper();
    const flight = northbound();
    m.resetAim(flight);
    const out = m.map(emptySnapshot(), flight, 1 / 60, { ...idlePad(), roll: 0.6, pitch: -0.4 });
    expect(out.roll).toBe(0.6);
    expect(out.pitch).toBe(-0.4);
    expect(m.aimDirection.z).toBeLessThan(-0.99);
  });

  it('adds pad buttons and throttle to the keyboard', () => {
    const m = new ControlMapper();
    const pad = { ...idlePad(), throttleRate: 1, down: new Set(['cannon'] as const), pressed: new Set(['flares', 'nextTarget'] as const) };
    const out = m.map(emptySnapshot(), northbound(), 0.5, pad);
    expect(out.throttle).toBeCloseTo(1, 5);
    expect(out.fireCannon).toBe(true);
    expect(out.countermeasures).toBe(true);
    expect(out.cycleTarget).toBe(true);
    expect(out.fireMissile).toBe(false);
  });

  it('takes a throttle lever only once it moves', () => {
    const m = new ControlMapper();
    expect(m.map(emptySnapshot(), northbound(), 1 / 60, { ...idlePad(), throttle: 0 }).throttle).toBeCloseTo(0.8, 5);
    expect(m.map(emptySnapshot(), northbound(), 1 / 60, { ...idlePad(), throttle: 0.5 }).throttle).toBeCloseTo(0.5, 5);
  });

  it('looks around with the right stick', () => {
    const m = new ControlMapper();
    const out = m.map(emptySnapshot(), northbound(), 1 / 60, { ...idlePad(), lookX: 1 });
    expect(out.helmetSight).toBe(true);
    expect(out.lookYaw).toBeGreaterThan(2);
  });

  it('reports pause and the scoreboard from keys or the pad', () => {
    const m = new ControlMapper();
    expect(m.pauseRequested(snap({ pressed: new Set(['KeyP']) }), null)).toBe(true);
    expect(m.pauseRequested(snap({ pressed: new Set(['Escape']) }), null)).toBe(true);
    expect(m.pauseRequested(emptySnapshot(), { ...idlePad(), pressed: new Set(['pause'] as const) })).toBe(true);
    expect(m.scoresHeld(hold('Tab'), null)).toBe(true);
    expect(m.scoresHeld(emptySnapshot(), { ...idlePad(), down: new Set(['scores'] as const) })).toBe(true);
  });
});
