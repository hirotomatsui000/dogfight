import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { AircraftVisual } from '../../shared/data/aircraft/types.ts';
import { DEG, lerp } from '../../shared/math/units.ts';

export interface AircraftModel {
  root: Group;
  nozzles: Object3D[];
  afterburners: Mesh[];
}

const SURFACE_THICKNESS = 0.22;

/** Wing-like planform in the horizontal plane. `rootLeZ` is the body z of the root leading edge (forward = -z). */
function horizontalPlanform(halfSpan: number, rootChord: number, tipChord: number, sweepDeg: number, rootLeZ: number): BufferGeometry {
  const yLe = -rootLeZ;
  const tipLe = yLe - Math.tan(sweepDeg * DEG) * halfSpan;
  const shape = new Shape([
    new Vector2(0, yLe),
    new Vector2(-halfSpan, tipLe),
    new Vector2(-halfSpan, tipLe - tipChord),
    new Vector2(0, yLe - rootChord),
    new Vector2(halfSpan, tipLe - tipChord),
    new Vector2(halfSpan, tipLe),
  ]);
  const geometry = new ExtrudeGeometry(shape, { depth: SURFACE_THICKNESS, bevelEnabled: false });
  // shape (x, y, z) -> body (x, z, -y): the planform lies flat, thickness points up.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -SURFACE_THICKNESS / 2, 0);
  return geometry;
}

/** Fin planform standing upright: root on the x-y origin plane, `height` up, swept back. */
function finPlanform(height: number, rootChord: number, tipChord: number, sweepDeg: number, rootLeZ: number): BufferGeometry {
  const yLe = -rootLeZ;
  const tipLe = yLe - Math.tan(sweepDeg * DEG) * height;
  const shape = new Shape([
    new Vector2(0, yLe),
    new Vector2(height, tipLe),
    new Vector2(height, tipLe - tipChord),
    new Vector2(0, yLe - rootChord),
  ]);
  const geometry = new ExtrudeGeometry(shape, { depth: SURFACE_THICKNESS, bevelEnabled: false });
  // shape (sx, sy, sz) -> body (-sz, sx, -sy): a proper rotation (det = +1), so normals stay outward.
  geometry.applyMatrix4(new Matrix4().set(0, 0, -1, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1));
  geometry.translate(SURFACE_THICKNESS / 2, 0, 0);
  return geometry;
}

export function buildAircraftModel(v: AircraftVisual): AircraftModel {
  const root = new Group();
  const L = v.lengthM;
  const R = v.fuselageRadiusM;
  const primary = new MeshStandardMaterial({ color: v.colors.primary, roughness: 0.55, metalness: 0.25 });
  const secondary = new MeshStandardMaterial({ color: v.colors.secondary, roughness: 0.6, metalness: 0.2 });
  const accent = new MeshStandardMaterial({ color: v.colors.accent, roughness: 0.4, metalness: 0.6 });
  const glass = new MeshStandardMaterial({ color: 0x1b2530, roughness: 0.05, metalness: 0.7 });

  // Fuselage: lathe profile from tail (y = -L/2) to nose (y = +L/2), rotated so the nose points to -z.
  const profile: Vector2[] = [];
  const samples = 28;
  for (let s = samples; s >= 0; s--) {
    const t = s / samples;
    let r = R;
    if (t < v.noseLengthFraction) r = R * (0.03 + 0.97 * Math.sqrt(t / v.noseLengthFraction));
    else if (t > 0.8) r = R * lerp(1, 0.72, (t - 0.8) / 0.2);
    profile.push(new Vector2(r, L / 2 - t * L));
  }
  const fuselageGeometry = new LatheGeometry(profile, 18);
  fuselageGeometry.rotateX(-Math.PI / 2);
  const fuselage = new Mesh(fuselageGeometry, primary);
  fuselage.name = 'fuselage';
  fuselage.scale.set(1.1, 0.85, 1);
  root.add(fuselage);

  const canopy = new Mesh(new SphereGeometry(R * 0.62, 16, 12), glass);
  canopy.name = 'canopy';
  canopy.scale.set(1, 0.8, 3);
  canopy.position.set(0, R * 0.62, -L / 2 + L * v.noseLengthFraction * 1.1);
  root.add(canopy);

  const wingRootLeZ = -L / 2 + L * v.wingPositionFraction;
  const wings = new Mesh(
    horizontalPlanform(v.spanM / 2, v.wingRootChordM, v.wingTipChordM, v.wingSweepDeg, wingRootLeZ),
    primary,
  );
  wings.name = 'wings';
  wings.position.y = -R * 0.2;
  root.add(wings);

  const tailRootChord = v.wingRootChordM * 0.42;
  const stabilators = new Mesh(
    horizontalPlanform(v.spanM * 0.3, tailRootChord, tailRootChord * 0.4, v.wingSweepDeg, L / 2 - tailRootChord - L * 0.03),
    secondary,
  );
  stabilators.name = 'stabilators';
  stabilators.position.y = -R * 0.1;
  root.add(stabilators);

  const finRootChord = v.wingRootChordM * 0.5;
  const finRootLeZ = L / 2 - finRootChord - L * 0.04;
  if (v.tail === 'single') {
    const fin = new Mesh(finPlanform(v.tailHeightM, finRootChord, finRootChord * 0.35, 45, finRootLeZ), secondary);
    fin.name = 'tail-center';
    fin.position.y = R * 0.7;
    root.add(fin);
  } else {
    const cant = (v.tail === 'twin-canted' ? 25 : 12) * DEG;
    for (const side of [-1, 1] as const) {
      const fin = new Mesh(finPlanform(v.tailHeightM * 0.85, finRootChord * 0.85, finRootChord * 0.3, 42, finRootLeZ), secondary);
      fin.name = side < 0 ? 'tail-left' : 'tail-right';
      fin.position.set(side * R * 0.9, R * 0.5, 0);
      fin.rotation.z = -side * cant;
      root.add(fin);
    }
  }

  if (v.canards) {
    const canardChord = v.wingRootChordM * 0.3;
    const canards = new Mesh(
      horizontalPlanform(v.spanM * 0.22, canardChord, canardChord * 0.4, 45, -L / 2 + L * 0.3),
      secondary,
    );
    canards.name = 'canards';
    canards.position.y = R * 0.1;
    root.add(canards);
  }

  const intake = new Mesh(new BoxGeometry(v.engines === 2 ? R * 2.4 : R * 1.2, R * 0.7, L * 0.28), secondary);
  intake.name = 'intakes';
  intake.position.set(0, -R * 0.75, -L / 2 + L * 0.42);
  root.add(intake);

  const nozzleRadius = v.engines === 2 ? R * 0.45 : R * 0.62;
  const xs = v.engines === 2 ? [-R * 0.5, R * 0.5] : [0];
  for (const x of xs) {
    const nozzleGeometry = new CylinderGeometry(nozzleRadius, nozzleRadius * 1.1, 1.4, 14, 1, true);
    nozzleGeometry.rotateX(Math.PI / 2);
    const nozzle = new Mesh(nozzleGeometry, accent);
    nozzle.name = 'nozzle';
    nozzle.position.set(x, 0, L / 2 - 0.3);
    root.add(nozzle);
  }
  const engines = addEngines(root, xs.map((x) => new Vector3(x, 0, L / 2 + 0.4)), nozzleRadius);
  return { root, ...engines };
}

/**
 * Adds a nozzle exit at each point (body metres) with an afterburner flame pointing aft. The flames start hidden;
 * SceneSync shows them and scales their length with throttle.
 */
export function addEngines(root: Object3D, exits: readonly Vector3[], nozzleRadiusM: number): Pick<AircraftModel, 'nozzles' | 'afterburners'> {
  const nozzles: Object3D[] = [];
  const afterburners: Mesh[] = [];
  const flameMaterial = new MeshBasicMaterial({
    color: 0xffa24a,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  for (const point of exits) {
    const exit = new Object3D();
    exit.name = 'nozzle-exit';
    exit.position.copy(point);
    root.add(exit);
    nozzles.push(exit);

    // Cone pointing aft (+z) from the nozzle exit, 1 m long until scaled.
    const flameGeometry = new ConeGeometry(nozzleRadiusM * 0.9, 1, 12, 1, true);
    flameGeometry.rotateX(Math.PI / 2);
    flameGeometry.translate(0, 0, 0.5);
    const flame = new Mesh(flameGeometry, flameMaterial);
    flame.name = 'afterburner';
    flame.visible = false;
    exit.add(flame);
    afterburners.push(flame);
  }
  return { nozzles, afterburners };
}
