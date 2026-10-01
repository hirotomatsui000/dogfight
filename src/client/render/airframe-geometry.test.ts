import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type LoftSection, loftGeometry, panelGeometry, projectUV } from './airframe-geometry.ts';

/** Area-weighted average face normal of the triangles whose centroid lies where `where` says. */
function outward(g: ReturnType<typeof loftGeometry>, where: (c: Vector3) => boolean): Vector3 {
  const p = g.getAttribute('position');
  const idx = g.getIndex();
  if (!idx) throw new Error('indexed geometry expected');
  const sum = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(p, idx.getX(i));
    b.fromBufferAttribute(p, idx.getX(i + 1));
    c.fromBufferAttribute(p, idx.getX(i + 2));
    const centroid = new Vector3().add(a).add(b).add(c).divideScalar(3);
    if (!where(centroid)) continue;
    sum.add(new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)));
  }
  return sum.normalize();
}

const tube = (z: number, r: number, n = 2): LoftSection => ({ z, x: 0, y: 0, w: r, top: r, bottom: r, n });

describe('airframe geometry', () => {
  it('lofts a tube through its sections with outward faces and UVs along it', () => {
    const g = loftGeometry([tube(-5, 0.01), tube(-3, 1), tube(3, 1), tube(5, 0.6)], 16);
    const box = new Box3().setFromBufferAttribute(g.getAttribute('position') as never);
    expect(box.min.z).toBeCloseTo(-5, 6);
    expect(box.max.x).toBeCloseTo(1, 6);
    expect(outward(g, (c) => c.y > 0.8 && Math.abs(c.z) < 2).y).toBeGreaterThan(0.9);
    expect(outward(g, (c) => c.x > 0.8 && Math.abs(c.z) < 2).x).toBeGreaterThan(0.9);
    expect(outward(g, (c) => c.y < -0.8 && Math.abs(c.z) < 2).y).toBeLessThan(-0.9);
    const uv = g.getAttribute('uv');
    expect([uv.getX(0), uv.getY(0)]).toEqual([0, 0]);
    expect([uv.getX(uv.count - 1), uv.getY(uv.count - 1)]).toEqual([1, 1]);
  });

  it('makes boxy (chined) sections with a high exponent', () => {
    const round = loftGeometry([tube(0, 1, 2), tube(1, 1, 2)], 32);
    const boxy = loftGeometry([tube(0, 1, 6), tube(1, 1, 6)], 32);
    // At 45° around, a boxy section reaches further out than an ellipse.
    const at45 = (g: ReturnType<typeof loftGeometry>) => g.getAttribute('position').getX(12);
    expect(at45(boxy)).toBeGreaterThan(at45(round));
  });

  it('builds a mirrored wing with skins facing up and down and a thin airfoil', () => {
    const g = panelGeometry({ span: 4, rootChord: 5, tipChord: 1.5, sweepDeg: 40, thickness: 0.05 }, true);
    const box = new Box3().setFromBufferAttribute(g.getAttribute('position') as never);
    expect(box.min.x).toBeCloseTo(-4, 6);
    expect(box.max.x).toBeCloseTo(4, 6);
    expect(box.max.y).toBeCloseTo(0.125, 3);
    // The root trailing edge (5 m) lies aft of the swept tip's (3.36 + 1.5 m).
    expect(box.max.z).toBeCloseTo(Math.max(5, Math.tan((40 * Math.PI) / 180) * 4 + 1.5), 3);
    for (const side of [1, -1]) {
      expect(outward(g, (c) => side * c.x > 0.5 && c.y > 0.01).y).toBeGreaterThan(0.9);
      expect(outward(g, (c) => side * c.x > 0.5 && c.y < -0.01).y).toBeLessThan(-0.9);
    }
  });

  it('projects UVs from body axes', () => {
    const g = projectUV(panelGeometry({ span: 2, rootChord: 2, tipChord: 1, sweepDeg: 0, thickness: 0.05 }, true), 'x', -2, 2, 'z', 0, 2);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
    }
  });
});
