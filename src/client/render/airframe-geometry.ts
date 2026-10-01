import { BufferGeometry, Float32BufferAttribute } from 'three';
import { DEG } from '../../shared/math/units.ts';

/**
 * Geometry for the parametric aircraft (spec §15.4, M3): bodies lofted through cross-sections and lifting surfaces
 * with a thin airfoil. Body frame: nose toward -z, up +y, right +x.
 */

/** One cross-section of a lofted body: a superellipse centred on (x, y) at station z. */
export interface LoftSection {
  z: number;
  x: number;
  y: number;
  /** half-width */
  w: number;
  /** height above the centre */
  top: number;
  /** depth below the centre */
  bottom: number;
  /** superellipse exponent: 2 = ellipse, higher = boxier (chined), lower = diamond-like */
  n: number;
}

const superPow = (c: number, n: number) => Math.sign(c) * Math.abs(c) ** (2 / n);

/**
 * A smooth tube through the sections (front to back, z increasing). The seam runs along the bottom; u runs along the
 * body (0 at the front) and v around it (0 at the belly), for painted textures. Ends are open: a tip section with
 * ~zero size closes the nose.
 */
export function loftGeometry(sections: readonly LoftSection[], around = 24): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const z0 = sections[0].z;
  const span = sections[sections.length - 1].z - z0 || 1;
  for (const s of sections) {
    for (let j = 0; j <= around; j++) {
      // From the belly (-90°) around the right side, over the top and down the left.
      const a = -Math.PI / 2 + (2 * Math.PI * j) / around;
      const c = Math.cos(a);
      const si = Math.sin(a);
      pos.push(s.x + s.w * superPow(c, s.n), s.y + (si >= 0 ? s.top : s.bottom) * superPow(si, s.n), s.z);
      uv.push((s.z - z0) / span, j / around);
    }
  }
  const row = around + 1;
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * row + j;
      const b = a + row;
      // Wound so the faces point outward (counter-clockwise seen from outside).
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A trapezoid lifting surface: wing, tailplane, canard, fin or leading-edge extension. */
export interface PanelSpec {
  /** root to tip */
  span: number;
  rootChord: number;
  tipChord: number;
  /** leading-edge sweep */
  sweepDeg: number;
  /** thickness as a fraction of the chord at the root (thinner toward the tip) */
  thickness: number;
}

/** Chord stations of the airfoil and their share of the maximum thickness: sharp edges, thickest at 30%. */
const AIRFOIL: readonly (readonly [chord: number, thickness: number])[] = [
  [0, 0],
  [0.08, 0.62],
  [0.3, 1],
  [0.65, 0.62],
  [1, 0],
];

/**
 * A lifting surface in its own frame: span along +x (and mirrored to -x when `mirrored`), chord along +z from the
 * root leading edge at the origin, thickness along y. Thin top and bottom skins meet at the edges; the tip is closed.
 */
export function panelGeometry(p: PanelSpec, mirrored: boolean): BufferGeometry {
  const pos: number[] = [];
  const index: number[] = [];
  const stations = [0, 1];
  const tipLe = Math.tan(p.sweepDeg * DEG) * p.span;
  const add = (side: 1 | -1) => {
    const base = pos.length / 3;
    const k = AIRFOIL.length;
    // Rows: for each span station, the top skin then the bottom skin.
    for (const s of stations) {
      const chord = p.rootChord + (p.tipChord - p.rootChord) * s;
      const le = tipLe * s;
      const half = 0.5 * chord * p.thickness * (1 - 0.35 * s);
      for (const sign of [1, -1]) {
        for (const [c, t] of AIRFOIL) pos.push(side * p.span * s, sign * half * t, le + c * chord);
      }
    }
    const top = (s: number, c: number) => base + s * 2 * k + c;
    const bottom = (s: number, c: number) => base + s * 2 * k + k + c;
    const quad = (a: number, b: number, c: number, d: number) => {
      // a-b along the chord at the root side, c-d at the tip side; flip for the mirrored half.
      if (side === 1) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    };
    for (let c = 0; c < k - 1; c++) {
      quad(top(0, c), top(0, c + 1), top(1, c), top(1, c + 1));
      quad(bottom(0, c + 1), bottom(0, c), bottom(1, c + 1), bottom(1, c));
    }
    // Tip cap: the tip airfoil's top and bottom skins.
    for (let c = 0; c < k - 1; c++) {
      const a = top(1, c);
      const b = top(1, c + 1);
      const d = bottom(1, c);
      const e = bottom(1, c + 1);
      if (side === 1) index.push(a, b, d, b, e, d);
      else index.push(a, d, b, b, d, e);
    }
  };
  add(1);
  if (mirrored) add(-1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

type Axis = 'x' | 'y' | 'z';
const AXIS: Readonly<Record<Axis, number>> = { x: 0, y: 1, z: 2 };

/**
 * Projects texture coordinates from two body axes after the geometry is in place, so every surface shares one
 * painted texture laid over the aircraft from above (or from the side, for fins).
 */
export function projectUV(g: BufferGeometry, u: Axis, uMin: number, uMax: number, v: Axis, vMin: number, vMax: number): BufferGeometry {
  const p = g.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const a = [p.getX(i), p.getY(i), p.getZ(i)];
    uv.push((a[AXIS[u]] - uMin) / (uMax - uMin), (a[AXIS[v]] - vMin) / (vMax - vMin));
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}
