import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Shape, SphereGeometry } from 'three';
import type { AircraftConfig } from '../../shared/data/aircraft/types.ts';
import type { AircraftModel } from './aircraft-model.ts';

/** The rotating radar dish turns at about 6 rpm. */
export const ROTODOME_RAD_PER_S = (6 * 2 * Math.PI) / 60;

/** A flat planform (x out along the span, z aft) extruded to `thickness`, lying in the x-z plane. */
function planform(points: readonly (readonly [number, number])[], thickness: number): ExtrudeGeometry {
  const shape = new Shape();
  points.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
  shape.closePath();
  const g = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // Shape x/y → body x/z; the extrusion goes up.
  g.rotateX(Math.PI / 2);
  g.translate(0, thickness / 2, 0);
  return g;
}

function buildSentinel(config: AircraftConfig): Group {
  const v = config.visual;
  const L = v.lengthM;
  const R = v.fuselageRadiusM;
  const half = v.spanM / 2;
  const skin = new MeshStandardMaterial({ color: v.colors.primary, roughness: 0.55, metalness: 0.35 });
  const light = new MeshStandardMaterial({ color: v.colors.secondary, roughness: 0.5, metalness: 0.3 });
  const dark = new MeshStandardMaterial({ color: v.colors.accent, roughness: 0.6, metalness: 0.2 });
  const glass = new MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.15, metalness: 0.6 });
  const root = new Group();
  root.name = 'sentinel';

  // Fuselage: a long tube with a round nose and a tail that sweeps up.
  const bodyLength = L * 0.72;
  const body = new Mesh(new CylinderGeometry(R, R, bodyLength, 20).rotateX(Math.PI / 2), skin);
  body.position.z = -L * 0.06;
  const nose = new Mesh(new SphereGeometry(R, 20, 12).scale(1, 0.95, 1.9), skin);
  nose.position.z = body.position.z - bodyLength / 2;
  // Narrow end aft: rotating +90° about x turns the cylinder's top (+y) toward the tail (+z).
  const tail = new Mesh(new CylinderGeometry(R * 0.35, R, L * 0.2, 20).rotateX(Math.PI / 2), skin);
  tail.position.set(0, R * 0.35, body.position.z + bodyLength / 2 + L * 0.1);
  const cockpit = new Mesh(new SphereGeometry(R * 0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1.6), glass);
  cockpit.position.set(0, R * 0.55, nose.position.z + R * 0.6);
  root.add(body, nose, tail, cockpit);

  // Swept wings, tailplane and fin.
  const rootChord = v.wingRootChordM;
  const tipChord = v.wingTipChordM;
  const sweep = Math.tan((v.wingSweepDeg * Math.PI) / 180) * half;
  const wingZ = -L / 2 + v.wingPositionFraction * L;
  for (const side of [-1, 1]) {
    const wing = new Mesh(
      planform(
        [
          [0, 0],
          [side * half, sweep],
          [side * half, sweep + tipChord],
          [0, rootChord],
        ],
        0.45,
      ),
      light,
    );
    wing.position.set(0, -R * 0.35, wingZ);
    const stab = new Mesh(
      planform(
        [
          [0, 0],
          [side * half * 0.32, half * 0.22],
          [side * half * 0.32, half * 0.22 + 2.2],
          [0, 5],
        ],
        0.3,
      ),
      light,
    );
    stab.position.set(0, R * 0.6, L / 2 - 7);
    root.add(wing, stab);
    // Two engines under each wing.
    for (const k of [0.3, 0.58]) {
      const pod = new Mesh(new CylinderGeometry(0.85, 0.75, 4.2, 14).rotateX(Math.PI / 2), dark);
      pod.position.set(side * half * k, -R * 0.35 - 1.3, wingZ + sweep * k - 0.8);
      root.add(pod);
    }
  }
  const fin = new Mesh(
    planform(
      [
        [0, 0],
        [v.tailHeightM, 4.5],
        [v.tailHeightM, 7.5],
        [0, 8],
      ],
      0.35,
    ),
    skin,
  );
  // The fin stands upright: its planform x becomes height.
  fin.rotation.z = Math.PI / 2;
  fin.position.set(0, R * 0.4, L / 2 - 9);
  root.add(fin);

  // The radar dish on two struts, turning (SceneSync spins every object named "rotodome").
  const domeZ = wingZ + rootChord + 2;
  for (const dz of [-1.6, 1.6]) {
    const strut = new Mesh(new CylinderGeometry(0.25, 0.35, 2.6, 8), dark);
    strut.position.set(0, R + 1.1, domeZ + dz);
    root.add(strut);
  }
  const dome = new Object3D();
  dome.name = 'rotodome';
  dome.position.set(0, R + 2.7, domeZ);
  const disc = new Mesh(new CylinderGeometry(5.5, 5.5, 1.1, 32), light);
  const stripe = new Mesh(new CylinderGeometry(5.52, 5.52, 0.35, 32, 1, true), dark);
  dome.add(disc, stripe);
  root.add(dome);
  return root;
}

const templates = new Map<string, Group>();

/** The Sentinel radar aircraft (M5): built once per team and cloned. It has no afterburners. */
export function sentinelModel(config: AircraftConfig): AircraftModel {
  let template = templates.get(config.id);
  if (!template) {
    template = buildSentinel(config);
    templates.set(config.id, template);
  }
  return { root: template.clone(true), nozzles: [], afterburners: [] };
}
