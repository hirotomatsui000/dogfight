import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createFlightState } from '../../shared/physics/flight-model.ts';
import { ControlMapper, emptySnapshot, type InputSnapshot } from './control-mapper.ts';

const northbound = () => createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 200, throttle: 0.8 });
const snap = (over: Partial<InputSnapshot>): InputSnapshot => ({ ...emptySnapshot(), ...over });
const hold = (...codes: string[]) => snap({ keys: new Set(codes) });
/** Feeds `frames` frames of 1/60 s; mouse deltas, wheel and key edges only on the first frame. */
const run = (m: ControlMapper, s: InputSnapshot, frames: number, flight = northbound()) => {
  let out = m.map(s, flight, 1 / 60);
  for (let i = 1; i < frames; i++) out = m.map({ ...s, mouseDX: 0, mouseDY: 0, wheel: 0, pressed: new Set() }, flight, 1 / 60);
  return out;
};

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
