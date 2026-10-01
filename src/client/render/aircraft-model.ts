import {
  AdditiveBlending,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { AircraftConfig, AircraftVisual, TeamId } from '../../shared/data/aircraft/types.ts';
import { DEG } from '../../shared/math/units.ts';
import { type LoftSection, loftGeometry, type PanelSpec, panelGeometry, projectUV } from './airframe-geometry.ts';
import { liveryFor, liveryTextures, type Roundel } from './livery.ts';

export interface AircraftModel {
  root: Group;
  nozzles: Object3D[];
  afterburners: Mesh[];
}

/** Who wears the model: decides the paint scheme, markings and canopy. */
export interface ModelLook {
  /** aircraft id, for the seeded camouflage and the texture cache */
  id?: string;
  team?: TeamId;
  twoSeat?: boolean;
}

/** Twin engines further apart than this sit in separate nacelles with a flat deck between them. */
const NACELLE_SPACING_M = 1.8;

interface Shape {
  L: number;
  R: number;
  twin: boolean;
  spacing: number;
  wide: boolean;
  stealth: boolean;
  /** body half-width over the wing */
  midW: number;
  tailW: number;
  tailH: number;
  /** superellipse exponent of the body sections */
  n: number;
}

function shapeOf(v: AircraftVisual): Shape {
  const R = v.fuselageRadiusM;
  const twin = v.engines === 2;
  const spacing = twin ? (v.engineSpacingM ?? 1.25 * R) : 0;
  const wide = twin && spacing >= NACELLE_SPACING_M;
  const stealth = v.intakes === 'caret';
  let midW = R * 1.1;
  let tailW = R * 0.66;
  let tailH = R * 0.66;
  if (twin && !wide) {
    midW = Math.max(R * 1.15, spacing / 2 + R * 0.5);
    tailW = spacing / 2 + R * 0.45;
    tailH = R * 0.5;
  } else if (wide) {
    midW = R * 1.05;
    tailW = R * 0.3;
    tailH = R * 0.3;
  }
  return { L: v.lengthM, R, twin, spacing, wide, stealth, midW, tailW, tailH, n: stealth ? 3.4 : 2.3 };
}

/** Body stations from nose to tail: an ogive nose, the cockpit, the spine over the wing, and the taper to the nozzles. */
export function fuselageSections(v: AircraftVisual): LoftSection[] {
  const s = shapeOf(v);
  const { L, R } = s;
  const z = (t: number) => -L / 2 + t * L;
  const nf = v.noseLengthFraction;
  const out: LoftSection[] = [{ z: z(0), x: 0, y: -0.08 * R, w: 0.02 * R, top: 0.02 * R, bottom: 0.02 * R, n: 2 }];
  for (const k of [0.06, 0.16, 0.32, 0.52, 0.75, 1]) {
    const f = Math.sqrt(1 - (1 - k) ** 2);
    out.push({ z: z(nf * k), x: 0, y: -0.08 * R * (1 - k), w: R * 0.94 * f, top: R * (s.stealth ? 0.72 : 0.86) * f, bottom: R * 0.9 * f, n: s.stealth ? 2 + 1.2 * k : 2.2 });
  }
  const rearW = s.twin && !s.wide ? s.spacing / 2 + R * 0.48 : s.wide ? R * 0.7 : R * 0.95;
  const body: [t: number, w: number, top: number, bottom: number][] = [
    [nf + 0.06, R, R * 0.9, R * 0.95],
    [Math.min(Math.max(nf + 0.14, 0.33), 0.4), (R + s.midW) / 2, R, R * 0.95],
    [0.45, s.midW, R * 1.02, R * 0.9],
    [0.62, s.midW, R * 0.98, R * 0.88],
    [0.8, rearW, R * 0.82, R * 0.82],
    [0.94, s.tailW, s.tailH, s.tailH],
    [1, s.tailW * 0.94, s.tailH * 0.94, s.tailH * 0.94],
  ];
  for (const [t, w, top, bottom] of body) out.push({ z: z(t), x: 0, y: 0, w, top, bottom, n: s.n });
  return out;
}

/** Separate engine nacelles for widely spaced twins (Su-style), each with its intake at the front. */
function nacelleSections(s: Shape, side: 1 | -1): LoftSection[] {
  const { L, R } = s;
  const z = (t: number) => -L / 2 + t * L;
  const x = (side * s.spacing) / 2;
  return [
    { z: z(0.36), x, y: -0.4 * R, w: 0.42 * R, top: 0.42 * R, bottom: 0.5 * R, n: 4 },
    { z: z(0.48), x, y: -0.3 * R, w: 0.5 * R, top: 0.55 * R, bottom: 0.55 * R, n: 3 },
    { z: z(0.8), x, y: -0.15 * R, w: 0.52 * R, top: 0.52 * R, bottom: 0.5 * R, n: 2.2 },
    { z: z(0.97), x, y: -0.1 * R, w: 0.48 * R, top: 0.48 * R, bottom: 0.48 * R, n: 2 },
  ];
}

/** Intake ducts (except for nacelle intakes): one under the nose, or one on each side. */
function intakeDucts(v: AircraftVisual, s: Shape): LoftSection[][] {
  if (s.wide) return [];
  const { L, R } = s;
  const z = (t: number) => -L / 2 + t * L;
  if (v.intakes === 'chin') {
    return [
      [
        { z: z(0.27), x: 0, y: -1.02 * R, w: 0.5 * R, top: 0.3 * R, bottom: 0.42 * R, n: 2.6 },
        { z: z(0.42), x: 0, y: -0.98 * R, w: 0.56 * R, top: 0.35 * R, bottom: 0.4 * R, n: 2.6 },
        { z: z(0.58), x: 0, y: -0.82 * R, w: 0.45 * R, top: 0.3 * R, bottom: 0.28 * R, n: 2.4 },
      ],
    ];
  }
  const caret = v.intakes === 'caret';
  const n = caret ? 1.7 : 4;
  return ([1, -1] as const).map((side) => [
    { z: z(0.25), x: side * (R * 1.05 + 0.3 * R), y: caret ? 0 : -0.2 * R, w: 0.36 * R, top: 0.5 * R, bottom: 0.55 * R, n },
    { z: z(0.42), x: side * (s.midW * 0.85 + 0.2 * R), y: caret ? -0.05 * R : -0.25 * R, w: 0.38 * R, top: 0.5 * R, bottom: 0.55 * R, n },
    { z: z(0.6), x: side * s.midW * 0.75, y: -0.25 * R, w: 0.2 * R, top: 0.4 * R, bottom: 0.4 * R, n: 2.4 },
  ]);
}

function panel(spec: PanelSpec, mirrored: boolean, material: MeshStandardMaterial, name: string): Mesh {
  const mesh = new Mesh(panelGeometry(spec, mirrored), material);
  mesh.name = name;
  return mesh;
}

/** Bakes a mesh's transform into its geometry, so its UVs can be projected in body space. */
function bake(mesh: Mesh): Mesh {
  mesh.updateMatrix();
  mesh.geometry.applyMatrix4(mesh.matrix);
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  return mesh;
}

function opening(material: MeshBasicMaterial, s: LoftSection): Mesh {
  const disc = new Mesh(new CircleGeometry(1, 16), material);
  disc.name = 'intake-opening';
  disc.scale.set(s.w * 0.88, (s.top + s.bottom) * 0.42, 1);
  disc.position.set(s.x, s.y + (s.top - s.bottom) * 0.2, s.z + 0.02);
  disc.rotation.y = Math.PI;
  return disc;
}

/**
 * The generated model (spec §15.4, M3): a lofted fuselage with nose, cockpit and engine bulges, intakes, thin-airfoil
 * wings and tails, a glass canopy (one or two seats), team paint with panel lines and markings, and nozzles with
 * afterburner flames. The paint reflects the scene's sky environment.
 */
export function buildAircraftModel(v: AircraftVisual, look: ModelLook = {}): AircraftModel {
  const s = shapeOf(v);
  const { L, R } = s;
  const team = look.team ?? 'usa';
  const halfSpan = v.spanM / 2;
  const wingRootLeZ = -L / 2 + L * v.wingPositionFraction;
  const roundelSpan = 0.62;
  const roundelChord = v.wingRootChordM + (v.wingTipChordM - v.wingRootChordM) * roundelSpan;
  const roundelZ = wingRootLeZ + Math.tan(v.wingSweepDeg * DEG) * halfSpan * roundelSpan + roundelChord * 0.5;
  const roundelR = Math.min(0.32 * roundelChord, 0.9);
  const roundels: Roundel[] = ([1, -1] as const).map((side) => [
    0.5 + (side * roundelSpan * halfSpan) / v.spanM,
    (roundelZ + L / 2) / L,
    roundelR / v.spanM,
    roundelR / L,
  ]);
  const textures = look.id ? liveryTextures(look.id, team, v, roundels) : null;
  const livery = liveryFor(team, v);
  const bodyPaint = new MeshStandardMaterial({ color: textures ? 0xffffff : livery.base, map: textures?.body ?? null, roughness: 0.5, metalness: 0.2 });
  const surfacePaint = new MeshStandardMaterial({ color: textures ? 0xffffff : livery.base, map: textures?.surfaces ?? null, roughness: 0.52, metalness: 0.2 });
  const darkPaint = new MeshStandardMaterial({ color: livery.dark, roughness: 0.55, metalness: 0.2 });
  const teamPaint = new MeshStandardMaterial({ color: livery.team, roughness: 0.45, metalness: 0.15 });
  const metal = new MeshStandardMaterial({ color: v.colors.accent, roughness: 0.35, metalness: 0.8 });
  const dark = new MeshBasicMaterial({ color: 0x0b0d10, side: DoubleSide });
  const root = new Group();

  const fuselage = new Mesh(loftGeometry(fuselageSections(v), 28), bodyPaint);
  fuselage.name = 'fuselage';
  root.add(fuselage);

  const intakes = new Group();
  intakes.name = 'intakes';
  for (const duct of intakeDucts(v, s)) {
    intakes.add(new Mesh(loftGeometry(duct, 16), bodyPaint), opening(dark, duct[0]));
  }
  if (s.wide) {
    for (const side of [1, -1] as const) {
      const sections = nacelleSections(s, side);
      intakes.add(new Mesh(loftGeometry(sections, 20), bodyPaint), opening(dark, sections[0]));
    }
    // The flat deck between the nacelles.
    const deck = bake(panel({ span: s.spacing / 2 + 0.2 * R, rootChord: 0.58 * L, tipChord: 0.58 * L, sweepDeg: 0, thickness: 0.05 }, true, darkPaint, 'deck'));
    deck.geometry.translate(0, -0.15 * R, -L / 2 + 0.4 * L);
    intakes.add(deck);
  }
  root.add(intakes);

  // Wings (and leading-edge root extensions), tailplanes and canards share one texture laid on from above.
  const surfaceUV = (m: Mesh) => {
    projectUV(bake(m).geometry, 'x', -halfSpan, halfSpan, 'z', -L / 2, L / 2);
    return m;
  };
  const wings = new Mesh(panelGeometry({ span: halfSpan, rootChord: v.wingRootChordM, tipChord: v.wingTipChordM, sweepDeg: v.wingSweepDeg, thickness: 0.05 }, true), surfacePaint);
  wings.name = 'wings';
  wings.position.set(0, -0.15 * R, wingRootLeZ);
  root.add(surfaceUV(wings));

  if (v.lerx) {
    const span = s.midW + 0.45 * R;
    const rootChord = 0.24 * L;
    const rootLeZ = wingRootLeZ - 0.22 * L;
    const tipLeZ = wingRootLeZ + Math.tan(v.wingSweepDeg * DEG) * span - 0.4;
    const lerx = new Mesh(
      panelGeometry({ span, rootChord, tipChord: 0.4, sweepDeg: Math.atan2(tipLeZ - rootLeZ, span) / DEG, thickness: 0.035 }, true),
      surfacePaint,
    );
    lerx.name = 'lerx';
    lerx.position.set(0, -0.1 * R, rootLeZ);
    root.add(surfaceUV(lerx));
  }

  const tailRootChord = v.wingRootChordM * 0.42;
  const stabilators = new Mesh(panelGeometry({ span: v.spanM * 0.3, rootChord: tailRootChord, tipChord: tailRootChord * 0.4, sweepDeg: v.wingSweepDeg, thickness: 0.05 }, true), surfacePaint);
  stabilators.name = 'stabilators';
  stabilators.position.set(0, (s.wide ? -0.2 : -0.1) * R, L / 2 - tailRootChord - L * 0.03);
  root.add(surfaceUV(stabilators));

  if (v.canards) {
    const chord = v.wingRootChordM * 0.3;
    const canards = new Mesh(panelGeometry({ span: v.spanM * 0.22, rootChord: chord, tipChord: chord * 0.4, sweepDeg: 45, thickness: 0.05 }, true), surfacePaint);
    canards.name = 'canards';
    canards.position.set(0, 0.1 * R, -L / 2 + L * 0.3);
    root.add(surfaceUV(canards));
  }

  // Fins: built along +x, stood up, canted; a team-coloured flash near the tip.
  const finRootChord = v.wingRootChordM * (s.twin ? 0.42 : 0.5);
  const finSweep = v.tailSweepDeg ?? 45;
  const fin = (height: number, x: number, y: number, cantRad: number, name: string) => {
    const group = new Group();
    group.name = name;
    const spec = { span: height, rootChord: finRootChord, tipChord: finRootChord * 0.35, sweepDeg: finSweep, thickness: 0.06 };
    const skin = new Mesh(panelGeometry(spec, false), surfacePaint);
    skin.rotation.z = Math.PI / 2;
    const flashFrom = 0.8;
    const flashChord = spec.rootChord + (spec.tipChord - spec.rootChord) * flashFrom;
    const flash = new Mesh(panelGeometry({ ...spec, span: height * (1 - flashFrom), rootChord: flashChord, thickness: spec.thickness * 1.25 }, false), teamPaint);
    flash.name = 'fin-flash';
    flash.rotation.z = Math.PI / 2;
    flash.position.set(0, height * flashFrom, Math.tan(finSweep * DEG) * height * flashFrom);
    group.add(skin, flash);
    group.position.set(x, y, L / 2 - finRootChord - L * 0.04);
    group.rotation.z = cantRad;
    projectUV(bake(skin).geometry, 'y', 0, height, 'z', -finRootChord, finRootChord * 2);
    return group;
  };
  if (v.tail === 'single') {
    root.add(fin(v.tailHeightM, 0, s.tailH * 0.9, 0, 'tail-center'));
  } else {
    const cant = (v.tail === 'twin-canted' ? 25 : 10) * DEG;
    const x = s.wide ? s.spacing / 2 : Math.max(0.9 * R, s.spacing / 2);
    for (const side of [-1, 1] as const) {
      root.add(fin(v.tailHeightM * 0.9, side * x, (s.wide ? 0.3 : 0.45) * R, -side * cant, side < 0 ? 'tail-left' : 'tail-right'));
    }
  }

  // Canopy: tinted glass (gold on the stealthy jets) over a dark cockpit, with frames.
  const twoSeat = look.twoSeat ?? false;
  const canopyLength = (twoSeat ? 0.27 : 0.17) * L;
  const canopyZ = -L / 2 + L * v.noseLengthFraction + canopyLength * 0.45;
  const canopyY = R * 0.66;
  const glass = new MeshPhysicalMaterial({
    color: s.stealth ? 0xb39a4a : 0x9fb8cc,
    roughness: 0.04,
    metalness: 0.15,
    transparent: true,
    opacity: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.2,
  });
  const canopy = new Group();
  canopy.name = 'canopy';
  const bubble = new Mesh(new SphereGeometry(1, 32, 16), glass);
  bubble.scale.set(0.6 * R, 0.6 * R, canopyLength / 2);
  const cockpit = new Mesh(new SphereGeometry(1, 16, 10), new MeshStandardMaterial({ color: 0x15181c, roughness: 0.9 }));
  cockpit.scale.set(0.55 * R, 0.5 * R, canopyLength * 0.46);
  canopy.add(cockpit, bubble);
  const frameMaterial = new MeshStandardMaterial({ color: 0x2a3036, roughness: 0.6, metalness: 0.3 });
  for (const at of twoSeat ? [-0.28, 0.05] : [-0.3]) {
    const frame = new Mesh(new TorusGeometry(1, 0.035, 6, 24, Math.PI), frameMaterial);
    const k = Math.sqrt(1 - (2 * at) ** 2);
    frame.scale.set(0.6 * R * k * 1.01, 0.6 * R * k * 1.01, 1);
    frame.position.z = at * canopyLength;
    canopy.add(frame);
  }
  canopy.position.set(0, canopyY, canopyZ);
  root.add(canopy);

  const nozzleRadius = s.twin ? (s.wide ? 0.46 * R : Math.min(0.45 * R, (s.spacing / 2) * 0.92)) : s.tailW * 0.92;
  const xs = s.twin ? [-s.spacing / 2, s.spacing / 2] : [0];
  const nozzleY = s.wide ? -0.1 * R : 0;
  for (const x of xs) {
    const nozzleGeometry = new CylinderGeometry(nozzleRadius, nozzleRadius * 1.08, 1.4, 18, 1, true);
    nozzleGeometry.rotateX(Math.PI / 2);
    const nozzle = new Mesh(nozzleGeometry, metal);
    nozzle.name = 'nozzle';
    nozzle.position.set(x, nozzleY, L / 2 - 0.3);
    const inner = new Mesh(new CircleGeometry(nozzleRadius * 0.95, 18), dark);
    inner.position.set(x, nozzleY, L / 2 - 0.5);
    root.add(nozzle, inner);
  }
  const engines = addEngines(root, xs.map((x) => new Vector3(x, nozzleY, L / 2 + 0.4)), nozzleRadius);
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

const templates = new Map<string, AircraftModel>();

/** A copy of the jet's generated model; geometry, materials and textures are built once per type and shared. */
export function parametricModel(config: AircraftConfig): AircraftModel {
  let template = templates.get(config.id);
  if (!template) {
    template = buildAircraftModel(config.visual, { id: config.id, team: config.team, twoSeat: config.sensors.twoSeat });
    templates.set(config.id, template);
  }
  const root = template.root.clone(true);
  const nozzles: Object3D[] = [];
  const afterburners: Mesh[] = [];
  root.traverse((o) => {
    if (o.name === 'nozzle-exit') nozzles.push(o);
    if (o.name === 'afterburner' && o instanceof Mesh) afterburners.push(o);
  });
  return { root, nozzles, afterburners };
}
