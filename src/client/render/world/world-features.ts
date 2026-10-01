import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { MapDefinition } from '../../../shared/data/maps/map-definition.ts';
import type { Airfield, Settlement } from '../../../shared/map/features.ts';
import type { Terrain } from '../../../shared/map/terrain.ts';
import { Rng } from '../../../shared/math/rng.ts';
import { airfieldLayout, airfieldPoint, type Building, type Ground, nameSeed, placeBuildings, roadCells, roadRibbon, runwayNumber } from './feature-layout.ts';

/** Settlements and roads disappear beyond these distances (their ground tint and night lights stay). */
const CITY_RANGE_M = 45000;
const VILLAGE_RANGE_M = 18000;
const HIGHWAY_RANGE_M = 30000;
const LOCAL_ROAD_RANGE_M = 14000;
const AIRFIELD_RANGE_M = 40000;
/** Paved surfaces float this far above the flattened ground, clear of depth fighting. */
const PAVED_LIFT_M = 0.35;

const WALLS = ['#d8d2c4', '#c9c1b0', '#e6e1d6', '#b9b2a4', '#a8a39a', '#d4c9b0'].map((c) => new Color(c));
const BLOCKS = ['#9a9c9e', '#b0aca4', '#8c8f92', '#c4beb2', '#a39b8e'].map((c) => new Color(c));
const ROOFS = ['#8b3a2a', '#7a3b2e', '#5c4033', '#6b6b6b', '#9a4a32', '#4f4a45'].map((c) => new Color(c));

/** Night lights of the world, for the environment to show after dusk (M4). */
export interface NightLights {
  /** x, y, z per light */
  positions: Float32Array;
  /** r, g, b per light */
  colors: Float32Array;
}

/** A unit box from y = 0 to 1, and a unit gable roof (ridge along z) from y = 0 to 1. */
function unitBox(): BufferGeometry {
  return new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
}

function unitRoof(): BufferGeometry {
  const g = new BufferGeometry();
  // Two sloped faces and two gable ends.
  const p = [
    [-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5],
    [-0.5, 0, 0.5], [0, 1, 0.5], [0.5, 0, 0.5],
    [-0.5, 0, -0.5], [0, 1, -0.5], [0, 1, 0.5], [-0.5, 0, -0.5], [0, 1, 0.5], [-0.5, 0, 0.5],
    [0.5, 0, -0.5], [0.5, 0, 0.5], [0, 1, 0.5], [0.5, 0, -0.5], [0, 1, 0.5], [0, 1, -0.5],
  ].flat();
  g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
  g.computeVertexNormals();
  return g;
}

const BOX = unitBox();
const ROOF = unitRoof();
const wallMaterial = new MeshStandardMaterial({ roughness: 0.9 });
const roofMaterial = new MeshStandardMaterial({ roughness: 0.8 });
const highwayMaterial = new MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.92 });
const localRoadMaterial = new MeshStandardMaterial({ color: 0x5f5a52, roughness: 0.95 });
const concreteMaterial = new MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.95 });
const hangarMaterial = new MeshStandardMaterial({ color: 0x6d7466, roughness: 0.7, metalness: 0.3, side: DoubleSide });
const towerMaterial = new MeshStandardMaterial({ color: 0xc9c5ba, roughness: 0.85 });
const glassMaterial = new MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.15, metalness: 0.6 });

interface Ranged {
  object: Object3D;
  center: Vector3;
  range: number;
}

/**
 * Airfields, towns and roads on Lechovia (spec §12.3): runways with markings, taxiways, aprons, hangars and towers;
 * instanced buildings per settlement; road ribbons. Distant ones are hidden. Also collects the night lights.
 */
export class WorldFeatures {
  readonly group = new Group();
  readonly cityLights: NightLights;
  readonly runwayLights: NightLights;
  private readonly ranged: Ranged[] = [];
  private readonly textures: CanvasTexture[] = [];

  constructor(def: MapDefinition, terrain: Terrain) {
    this.group.name = 'world-features';
    const features = def.features;
    const city: number[] = [];
    const cityColors: number[] = [];
    const runway: number[] = [];
    const runwayColors: number[] = [];
    if (features) {
      const ground: Ground = { heightAt: (x, z) => terrain.heightAt(x, z), coverAt: (x, z) => def.landCover(x, z, 0, 0) };
      const cells = roadCells(features.roads);
      for (const s of features.settlements) {
        const buildings = placeBuildings(s, ground, cells);
        this.addSettlement(s, buildings);
        const rng = new Rng(nameSeed(s.name) ^ 0x9e3779b9);
        for (const b of buildings) {
          if (rng.next() > (s.kind === 'city' ? 0.8 : 0.6)) continue;
          city.push(b.x + rng.range(-3, 3), b.y + Math.min(b.height, 4 + rng.range(0, b.height - 4)), b.z + rng.range(-3, 3));
          const warm = rng.next();
          cityColors.push(1, 0.72 + 0.2 * warm, 0.4 + 0.35 * warm);
        }
      }
      for (const road of features.roads) {
        const ribbon = roadRibbon(road, ground, road.kind === 'highway' ? 12 : 6);
        this.addRoad(ribbon, road.kind === 'highway');
        // Sodium street lights where a road runs through a town.
        for (let i = 0; i < ribbon.length; i += 6 * 2) {
          const x = ribbon[i];
          const z = ribbon[i + 2];
          if (ground.coverAt(x, z) !== 'urban') continue;
          city.push(x, ribbon[i + 1] + 8, z);
          cityColors.push(1, 0.62, 0.25);
        }
      }
      for (const a of features.airfields) this.addAirfield(a, runway, runwayColors);
    }
    this.cityLights = { positions: new Float32Array(city), colors: new Float32Array(cityColors) };
    this.runwayLights = { positions: new Float32Array(runway), colors: new Float32Array(runwayColors) };
  }

  /** Hides features far from the camera. */
  update(camera: Vector3): void {
    for (const r of this.ranged) r.object.visible = r.center.distanceToSquared(camera) < r.range * r.range;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof Mesh && o.geometry !== BOX && o.geometry !== ROOF) o.geometry.dispose();
      if (o instanceof InstancedMesh) o.dispose();
    });
    for (const t of this.textures) t.dispose();
    this.group.clear();
  }

  private track(object: Object3D, x: number, y: number, z: number, range: number): void {
    this.group.add(object);
    this.ranged.push({ object, center: new Vector3(x, y, z), range });
  }

  private addSettlement(s: Settlement, buildings: readonly Building[]): void {
    if (buildings.length === 0) return;
    const town = new Group();
    town.name = `town-${s.name}`;
    const walls = new InstancedMesh(BOX, wallMaterial, buildings.length);
    const pitched = buildings.filter((b) => b.roof === 'pitched');
    const roofs = new InstancedMesh(ROOF, roofMaterial, Math.max(1, pitched.length));
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const pos = new Vector3();
    const scale = new Vector3();
    const sink = 3;
    let r = 0;
    buildings.forEach((b, i) => {
      q.setFromAxisAngle(up, b.angle);
      // Walls reach a little into the ground so slopes never show a gap under them.
      m.compose(pos.set(b.x - s.x, b.y - sink, b.z - s.z), q, scale.set(b.width, b.height + sink, b.depth));
      walls.setMatrixAt(i, m);
      const palette = b.roof === 'flat' ? BLOCKS : WALLS;
      walls.setColorAt(i, palette[Math.floor(b.tint * palette.length) % palette.length]);
      if (b.roof === 'pitched') {
        m.compose(pos.set(b.x - s.x, b.y + b.height, b.z - s.z), q, scale.set(b.width + 0.6, b.width * 0.42, b.depth + 0.6));
        roofs.setMatrixAt(r, m);
        roofs.setColorAt(r, ROOFS[Math.floor(b.tint * 7.31 * ROOFS.length) % ROOFS.length]);
        r++;
      }
    });
    roofs.count = r;
    walls.computeBoundingSphere();
    roofs.computeBoundingSphere();
    town.add(walls);
    if (r > 0) town.add(roofs);
    town.position.set(s.x, 0, s.z);
    this.track(town, s.x, buildings[0].y, s.z, s.kind === 'city' ? CITY_RANGE_M : VILLAGE_RANGE_M);
  }

  private addRoad(ribbon: Float32Array, highway: boolean): void {
    const count = ribbon.length / 3;
    if (count < 4) return;
    // Positions relative to the road's middle keep float precision far from the map centre.
    const mid = Math.floor(count / 4) * 2;
    const cx = ribbon[mid * 3];
    const cz = ribbon[mid * 3 + 2];
    const local = new Float32Array(ribbon.length);
    for (let i = 0; i < ribbon.length; i += 3) {
      local[i] = ribbon[i] - cx;
      local[i + 1] = ribbon[i + 1];
      local[i + 2] = ribbon[i + 2] - cz;
    }
    const indices: number[] = [];
    for (let k = 0; k + 3 < count; k += 2) indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(local, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    // Ribbons can wind either way: make every normal point up.
    const n = g.getAttribute('normal') as BufferAttribute;
    for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, highway ? highwayMaterial : localRoadMaterial);
    mesh.material.side = DoubleSide;
    mesh.position.set(cx, 0, cz);
    mesh.name = highway ? 'highway' : 'road';
    const sphere = g.boundingSphere!;
    this.track(mesh, cx + sphere.center.x, sphere.center.y, cz + sphere.center.z, (highway ? HIGHWAY_RANGE_M : LOCAL_ROAD_RANGE_M) + sphere.radius);
  }

  private addAirfield(a: Airfield, lights: number[], colors: number[]): void {
    const layout = airfieldLayout(a);
    const field = new Group();
    field.name = `airfield-${a.id}`;
    // Local frame: u (take-off direction) along −z, v (right of it) along +x, like a jet facing the heading.
    field.position.set(a.x, a.elevationM, a.z);
    field.rotation.y = -a.headingRad;
    const at = (u: number, v: number, y: number) => new Vector3(v, y, -u);
    for (const p of layout.paved) {
      const plane = new PlaneGeometry(p.width, p.length).rotateX(-Math.PI / 2);
      const material = p.kind === 'runway' ? this.runwayMaterial(a) : concreteMaterial;
      const mesh = new Mesh(plane, material);
      mesh.position.copy(at(p.u, p.v, PAVED_LIFT_M + (p.kind === 'runway' ? 0.1 : 0)));
      mesh.name = p.kind;
      field.add(mesh);
    }
    for (const h of layout.hangars) {
      // An arched hangar 30 m across and 40 m deep, its open side toward the apron.
      const arch = new CylinderGeometry(15, 15, 40, 18, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
      const hangar = new Mesh(arch, hangarMaterial);
      hangar.position.copy(at(h.u, h.v, 0));
      field.add(hangar);
      const back = new Mesh(new BoxGeometry(0.5, 15, 30), hangarMaterial);
      back.position.copy(at(h.u, h.v + 20, 7.5));
      field.add(back);
    }
    const tower = new Mesh(new BoxGeometry(8, 18, 8).translate(0, 9, 0), towerMaterial);
    tower.position.copy(at(layout.tower.u, layout.tower.v, 0));
    const cab = new Mesh(new BoxGeometry(11, 4, 11).translate(0, 20, 0), glassMaterial);
    cab.position.copy(tower.position);
    const roof = new Mesh(new BoxGeometry(12, 0.8, 12).translate(0, 22.4, 0), towerMaterial);
    roof.position.copy(tower.position);
    field.add(tower, cab, roof);
    this.track(field, a.x, a.elevationM, a.z, AIRFIELD_RANGE_M);

    const add = (list: [number, number][], r: number, g: number, b: number) => {
      for (const [u, v] of list) {
        const p = airfieldPoint(a, u, v);
        lights.push(p.x, a.elevationM + 0.8, p.z);
        colors.push(r, g, b);
      }
    };
    add(layout.edgeLights, 1, 0.95, 0.8);
    add(layout.thresholdLights, 0.2, 1, 0.35);
    add(layout.endLights, 1, 0.15, 0.1);
  }

  /** Asphalt with white markings: edge lines, centre-line dashes, threshold bars, aiming points and numbers. */
  private runwayMaterial(a: Airfield): MeshStandardMaterial {
    const W = 256;
    const H = 4096;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.9 });
    const sx = W / a.widthM;
    const sy = H / a.lengthM;
    ctx.fillStyle = '#2b2b2d';
    ctx.fillRect(0, 0, W, H);
    // Wear: darker tyre marks down the middle near each end.
    ctx.fillStyle = 'rgba(10,10,10,0.35)';
    ctx.fillRect(W * 0.3, 0, W * 0.4, 600 * sy);
    ctx.fillRect(W * 0.3, H - 600 * sy, W * 0.4, 600 * sy);
    ctx.fillStyle = '#e8e8e2';
    const rect = (u0: number, v0: number, du: number, dv: number) => ctx.fillRect((v0 + a.widthM / 2) * sx, u0 * sy, dv * sx, du * sy);
    rect(0, -a.widthM / 2 + 1, a.lengthM, 0.9);
    rect(0, a.widthM / 2 - 1.9, a.lengthM, 0.9);
    for (let u = 120; u < a.lengthM - 120; u += 60) rect(u, -0.45, 30, 0.9);
    for (const end of [0, a.lengthM - 36]) {
      for (let k = 0; k < 8; k++) {
        rect(end + 6, -a.widthM / 2 + 3 + k * 2.4, 30, 1.8);
        rect(end + 6, a.widthM / 2 - 4.8 - k * 2.4, 30, 1.8);
      }
    }
    for (const u of [300, a.lengthM - 345]) {
      rect(u, -9, 45, 6);
      rect(u, 3, 45, 6);
    }
    // Numbers. The canvas runs from the take-off threshold (top) to the far end (bottom), squeezed along the length,
    // and its x is the right of the take-off direction: each number is flipped to read upright for a pilot lined up
    // on its end.
    const drawNumber = (text: string, u: number, fromFarEnd: boolean) => {
      ctx.save();
      ctx.translate(W / 2, u * sy);
      ctx.scale(fromFarEnd ? -sx : sx, fromFarEnd ? sy : -sy);
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    drawNumber(runwayNumber(a.headingRad), 55, false);
    drawNumber(runwayNumber(a.headingRad + Math.PI), a.lengthM - 55, true);
    const texture = new CanvasTexture(canvas);
    // Unflipped, the top row lies at the threshold (local +z after the plane is laid flat).
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    this.textures.push(texture);
    return new MeshStandardMaterial({ map: texture, roughness: 0.9 });
  }
}
