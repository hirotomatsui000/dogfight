import { CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { AircraftVisual } from '../../shared/data/aircraft/types.ts';
import { GEAR_HEIGHT_M } from '../../shared/physics/ground.ts';

const strutMaterial = new MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.45, metalness: 0.6 });
const tyreMaterial = new MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.9 });
const STRUT = new CylinderGeometry(0.08, 0.08, 1, 8).translate(0, -0.5, 0);
const NOSE_WHEEL = new CylinderGeometry(0.32, 0.32, 0.2, 14).rotateZ(Math.PI / 2);
const MAIN_WHEEL = new CylinderGeometry(0.42, 0.42, 0.28, 14).rotateZ(Math.PI / 2);
/** The wheels touch the runway with the springs carrying the weight (about 12 cm down). */
const WHEEL_BOTTOM_Y = -(GEAR_HEIGHT_M - 0.12);

interface Leg {
  pivot: Group;
  /** fold axis and direction: the nose leg folds forward, the mains inward */
  axis: 'x' | 'z';
  sign: number;
}

function leg(x: number, y: number, z: number, wheel: CylinderGeometry, radius: number, axis: 'x' | 'z', sign: number): Leg {
  const pivot = new Group();
  pivot.position.set(x, y, z);
  const length = y - (WHEEL_BOTTOM_Y + radius);
  const strut = new Mesh(STRUT, strutMaterial);
  strut.scale.y = length;
  const tyre = new Mesh(wheel, tyreMaterial);
  tyre.position.y = -length;
  pivot.add(strut, tyre);
  return { pivot, axis, sign };
}

/**
 * Landing gear for a jet model (M4): a nose leg and two main legs sized so the wheels meet the runway where the ground
 * model holds the jet. `setGear` folds them away as the gear retracts.
 */
export function landingGear(v: AircraftVisual): Group {
  const g = new Group();
  g.name = 'landing-gear';
  const R = v.fuselageRadiusM;
  const mainZ = (v.wingPositionFraction - 0.5) * v.lengthM + 0.35 * v.wingRootChordM;
  const track = Math.max(R * 1.1, (v.engineSpacingM ?? 0) / 2) + 0.45;
  const legs = [
    leg(0, -R * 0.65, -v.lengthM / 2 + 0.22 * v.lengthM, NOSE_WHEEL, 0.32, 'x', 1),
    leg(-track, -R * 0.55, mainZ, MAIN_WHEEL, 0.42, 'z', 1),
    leg(track, -R * 0.55, mainZ, MAIN_WHEEL, 0.42, 'z', -1),
  ];
  for (const l of legs) g.add(l.pivot);
  g.userData.legs = legs;
  g.visible = false;
  return g;
}

/** 1 = down and locked, 0 = stowed (hidden). */
export function setGear(g: Group, gear: number): void {
  g.visible = gear > 0.01;
  if (!g.visible) return;
  const fold = (1 - gear) * (Math.PI / 2);
  for (const l of g.userData.legs as Leg[]) {
    if (l.axis === 'x') l.pivot.rotation.x = fold * l.sign;
    else l.pivot.rotation.z = fold * l.sign;
  }
}
