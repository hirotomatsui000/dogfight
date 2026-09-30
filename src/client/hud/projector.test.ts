import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEG } from '../../shared/math/units.ts';
import { Projector } from './projector.ts';

const setup = () => {
  const camera = new PerspectiveCamera(90, 2, 1, 100000);
  camera.position.set(0, 1000, 0);
  camera.updateMatrixWorld();
  const p = new Projector();
  p.setSize(1000, 500);
  return { camera, p };
};

describe('Projector', () => {
  it('puts a point straight ahead in the middle of the screen', () => {
    const { camera, p } = setup();
    const out = { x: 0, y: 0 };
    expect(p.point(camera, new Vector3(0, 1000, -500), out)).toBe(true);
    expect(out.x).toBeCloseTo(500, 6);
    expect(out.y).toBeCloseTo(250, 6);
  });

  it('refuses points behind the camera', () => {
    const { camera, p } = setup();
    expect(p.point(camera, new Vector3(0, 1000, 500), { x: 0, y: 0 })).toBe(false);
    expect(p.direction(camera, new Vector3(0, 0, 1), { x: 0, y: 0 })).toBe(false);
  });

  it('places a direction 45 degrees up at the top edge for a 90 degree field of view', () => {
    const { camera, p } = setup();
    const out = { x: 0, y: 0 };
    p.direction(camera, new Vector3(0, Math.sin(45 * DEG), -Math.cos(45 * DEG)), out);
    expect(out.y).toBeCloseTo(0, 3);
    expect(p.pixelsPerRadian(camera)).toBeCloseTo(250, 6);
  });
});
