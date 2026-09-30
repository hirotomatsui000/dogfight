import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, type CameraTarget, decayTrauma, sustainedTrauma } from './camera-rig.ts';

/** A jet at 1000 m pointing north (-z) unless told otherwise. */
const target = (position = new Vector3(0, 1000, 0), quaternion = new Quaternion()): CameraTarget => ({
  position,
  quaternion,
  gLoad: 1,
  mach: 0.6,
  throttle: 0.5,
  lookYaw: 0,
  lookPitch: 0,
});
const tick = (rig: CameraRig, seconds: number, t: CameraTarget, aim: Vector3 | null = null) => {
  for (let i = 0; i < Math.max(1, Math.round(seconds * 60)); i++) rig.update(1 / 60, t, aim);
};
const forward = (cam: PerspectiveCamera) => new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
const up = (cam: PerspectiveCamera) => new Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
const right = (cam: PerspectiveCamera) => new Vector3(1, 0, 0).applyQuaternion(cam.quaternion);

describe('camera shake', () => {
  it('derives trauma from G, the transonic band and afterburner, and decays it', () => {
    expect(sustainedTrauma(1, 0.6, 0.5)).toBe(0);
    expect(sustainedTrauma(9, 0.6, 0.5)).toBeCloseTo(0.5, 6);
    expect(sustainedTrauma(1, 1, 0.5)).toBe(0.25);
    expect(sustainedTrauma(1, 0.6, 1)).toBe(0.08);
    expect(decayTrauma(1, 1)).toBe(0);
    expect(decayTrauma(1, 0.2)).toBeCloseTo(0.7, 6);
  });
});

describe('CameraRig (always third person)', () => {
  it('starts behind and above the jet, looking the way it points', () => {
    const cam = new PerspectiveCamera();
    tick(new CameraRig(cam), 0, target());
    expect(cam.position.z).toBeGreaterThan(20);
    expect(cam.position.y).toBeGreaterThan(1003);
    expect(cam.position.distanceTo(new Vector3(0, 1000, 0))).toBeLessThan(50);
    expect(forward(cam).z).toBeLessThan(-0.95);
  });

  it('follows the mouse-aim direction and keeps the horizon level', () => {
    const cam = new PerspectiveCamera();
    // The jet still points north, but the player aims east (+x).
    tick(new CameraRig(cam), 1, target(), new Vector3(1, 0, 0));
    expect(cam.position.x).toBeLessThan(-20);
    expect(forward(cam).x).toBeGreaterThan(0.95);
    expect(Math.abs(right(cam).y)).toBeLessThan(1e-6);
  });

  it('rolls with the jet in keyboard mode', () => {
    const cam = new PerspectiveCamera();
    // Rolled 90° right: the jet's top now faces east (+x).
    const rolled = new Quaternion().setFromAxisAngle(new Vector3(0, 0, -1), Math.PI / 2);
    tick(new CameraRig(cam), 1, target(new Vector3(0, 1000, 0), rolled));
    expect(cam.position.z).toBeGreaterThan(20);
    expect(cam.position.x).toBeGreaterThan(3);
    expect(up(cam).x).toBeGreaterThan(0.95);
  });

  it('swings around the jet while the player looks around', () => {
    const cam = new PerspectiveCamera();
    const t = target();
    t.lookYaw = Math.PI / 2; // look right (east)
    tick(new CameraRig(cam), 1, t);
    expect(cam.position.x).toBeLessThan(-20);
    expect(forward(cam).x).toBeGreaterThan(0.95);
  });

  it('starts right behind a respawned jet instead of swinging round from the old heading', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    tick(rig, 1, target());
    const south = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    const spawn = target(new Vector3(20000, 2000, 5000), south);
    rig.reset();
    tick(rig, 0, spawn);
    // Behind a south-pointing jet is north of it.
    expect(cam.position.z).toBeLessThan(5000 - 20);
    expect(cam.position.distanceTo(spawn.position)).toBeLessThan(50);
    expect(forward(cam).z).toBeGreaterThan(0.95);
  });
});
