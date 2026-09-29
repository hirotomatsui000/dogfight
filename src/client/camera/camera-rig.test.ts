import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { kestrel } from '../../shared/data/aircraft/kestrel.ts';
import {
  blendPose,
  CameraRig,
  type CameraTarget,
  createPose,
  decayTrauma,
  NO_FREE_INPUT,
  pilotEyeOffset,
  sustainedTrauma,
} from './camera-rig.ts';

const target = (): CameraTarget => ({
  position: new Vector3(0, 1000, 0),
  quaternion: new Quaternion(),
  gLoad: 1,
  mach: 0.6,
  throttle: 0.5,
  eyeOffset: pilotEyeOffset(kestrel.visual),
  lookYaw: 0,
  lookPitch: 0,
});
const tick = (rig: CameraRig, seconds: number, t = target(), aim: Vector3 | null = null) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) rig.update(1 / 60, t, aim, NO_FREE_INPUT);
};

describe('camera math', () => {
  it('blends poses with smoothstep', () => {
    const a = createPose();
    const b = createPose();
    b.position.set(10, 0, 0);
    b.fov = 90;
    const out = createPose();
    expect(blendPose(a, b, 0, out).position.x).toBe(0);
    expect(blendPose(a, b, 1, out).position.x).toBe(10);
    expect(blendPose(a, b, 0.5, out).fov).toBeCloseTo(80, 6);
  });
  it('derives trauma from G, the transonic band and afterburner, and decays it', () => {
    expect(sustainedTrauma(1, 0.6, 0.5)).toBe(0);
    expect(sustainedTrauma(9, 0.6, 0.5)).toBeCloseTo(0.5, 6);
    expect(sustainedTrauma(1, 1, 0.5)).toBe(0.25);
    expect(sustainedTrauma(1, 0.6, 1)).toBe(0.08);
    expect(decayTrauma(1, 1)).toBe(0);
    expect(decayTrauma(1, 0.2)).toBeCloseTo(0.7, 6);
  });
  it('puts the pilot eye above the fuselage, ahead of center', () => {
    const eye = pilotEyeOffset(kestrel.visual);
    expect(eye.y).toBeGreaterThan(kestrel.visual.fuselageRadiusM);
    expect(eye.z).toBeLessThan(0);
  });
});

describe('CameraRig', () => {
  it('starts in HUD view at the pilot eye', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    tick(rig, 0.1);
    const t = target();
    expect(cam.position.distanceTo(t.position.clone().add(t.eyeOffset))).toBeLessThan(0.01);
    expect(cam.fov).toBe(75);
  });
  it('cycles hud -> chase -> free -> hud', () => {
    const rig = new CameraRig(new PerspectiveCamera());
    expect([rig.cycle(), rig.cycle(), rig.cycle()]).toEqual(['chase', 'free', 'hud']);
  });
  it('transitions smoothly into a chase view behind and above the aircraft', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    tick(rig, 0.1);
    const hudPos = cam.position.clone();
    rig.setMode('chase');
    tick(rig, 1 / 60);
    expect(cam.position.distanceTo(hudPos)).toBeLessThan(5);
    tick(rig, 1);
    expect(cam.position.z).toBeGreaterThan(25);
    expect(cam.position.y).toBeGreaterThan(1004);
  });
  it('flies the free camera with its own input', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    tick(rig, 0.1);
    rig.setMode('free');
    const start = cam.position.clone();
    for (let i = 0; i < 60; i++) rig.update(1 / 60, target(), null, { ...NO_FREE_INPUT, forward: 1 });
    expect(start.z - cam.position.z).toBeGreaterThan(200);
  });
});
