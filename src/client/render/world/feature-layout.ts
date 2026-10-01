import type { Airfield, Road, Settlement } from '../../../shared/map/features.ts';
import { airfieldWorld } from '../../../shared/map/features.ts';
import type { LandCover } from '../../../shared/map/land-cover.ts';
import { Rng } from '../../../shared/math/rng.ts';

export interface Ground {
  heightAt(x: number, z: number): number;
  coverAt(x: number, z: number): LandCover;
}

/** One building: footprint, height and orientation; `roof` is pitched (houses) or flat (blocks). */
export interface Building {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  angle: number;
  roof: 'pitched' | 'flat';
  /** 0 … 1 picks the wall and roof colours */
  tint: number;
}

/** Road cells are this wide when keeping buildings off the roads. */
const ROAD_CELL_M = 40;

/** A stable seed from a name. */
export function nameSeed(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Cells that roads pass through, so buildings stay off them. */
export function roadCells(roads: readonly Road[]): Set<string> {
  const cells = new Set<string>();
  for (const r of roads) {
    for (let p = 0; p + 3 < r.points.length; p += 2) {
      const [ax, az, bx, bz] = [r.points[p], r.points[p + 1], r.points[p + 2], r.points[p + 3]];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (ROAD_CELL_M / 2)));
      for (let s = 0; s <= n; s++) {
        const x = ax + ((bx - ax) * s) / n;
        const z = az + ((bz - az) * s) / n;
        cells.add(`${Math.floor(x / ROAD_CELL_M)},${Math.floor(z / ROAD_CELL_M)}`);
      }
    }
  }
  return cells;
}

/** How many buildings a settlement gets: the capital is densest, villages a few dozen houses. */
export function buildingCount(s: Settlement): number {
  if (s.kind === 'village') return Math.round(30 + s.radiusM / 12);
  return Math.round((s.capital ? 2600 : 1300) * (s.radiusM / (s.capital ? 5500 : 3500)) ** 2);
}

/**
 * Buildings for a settlement on its urban ground, never on water or a road. Cities get tall blocks near the centre and
 * houses further out; villages get houses with pitched roofs. Deterministic per settlement name.
 */
export function placeBuildings(s: Settlement, ground: Ground, roads: Set<string>): Building[] {
  const rng = new Rng(nameSeed(s.name));
  const count = buildingCount(s);
  const out: Building[] = [];
  for (let attempt = 0; attempt < count * 4 && out.length < count; attempt++) {
    // Denser toward the centre.
    const r = s.radiusM * Math.pow(rng.next(), 0.75);
    const a = rng.range(0, 2 * Math.PI);
    const x = s.x + Math.cos(a) * r;
    const z = s.z + Math.sin(a) * r;
    if (ground.coverAt(x, z) !== 'urban') continue;
    if (roads.has(`${Math.floor(x / ROAD_CELL_M)},${Math.floor(z / ROAD_CELL_M)}`)) continue;
    const central = 1 - r / s.radiusM;
    const block = s.kind === 'city' && rng.next() < 0.25 + 0.7 * central;
    const height = block ? rng.range(12, 22) + (s.capital ? 45 : 22) * central * central * rng.next() : rng.range(5, 8);
    out.push({
      x,
      y: ground.heightAt(x, z),
      z,
      width: block ? rng.range(18, 40) : rng.range(8, 13),
      depth: block ? rng.range(12, 22) : rng.range(7, 10),
      height,
      // Streets in a city run on a loose grid; village houses face the road at any angle.
      angle: s.kind === 'city' ? Math.round(rng.range(0, 4)) * (Math.PI / 2) + rng.range(-0.08, 0.08) : rng.range(0, Math.PI),
      roof: block ? 'flat' : 'pitched',
      tint: rng.next(),
    });
  }
  return out;
}

/**
 * A road as a ribbon draped over the terrain, sampled every `stepM`: x, y, z of the left and right edges per sample.
 * Over water the deck runs level between the banks (a bridge).
 */
export function roadRibbon(road: Road, ground: Ground, widthM: number, stepM = 30, liftM = 1): Float32Array {
  const pts: [number, number][] = [];
  for (let p = 0; p + 3 < road.points.length; p += 2) {
    const [ax, az, bx, bz] = [road.points[p], road.points[p + 1], road.points[p + 2], road.points[p + 3]];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / stepM));
    for (let s = 0; s < n; s++) pts.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n]);
  }
  pts.push([road.points.at(-2)!, road.points.at(-1)!]);
  const wet = pts.map(([x, z]) => {
    const c = ground.coverAt(x, z);
    return c === 'river' || c === 'lake' || c === 'sea';
  });
  const heights = pts.map(([x, z]) => ground.heightAt(x, z));
  // Bridges: level between the last dry point before the water and the first after it, a little higher.
  for (let i = 0; i < pts.length; i++) {
    if (!wet[i]) continue;
    let j = i;
    while (j < pts.length && wet[j]) j++;
    const from = heights[Math.max(0, i - 1)];
    const to = heights[Math.min(pts.length - 1, j)];
    for (let k = i; k < j; k++) heights[k] = Math.max(from, to) + 4;
    i = j;
  }
  const out = new Float32Array(pts.length * 6);
  for (let i = 0; i < pts.length; i++) {
    const [px, pz] = pts[Math.max(0, i - 1)];
    const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(nx - px, nz - pz) || 1;
    const rx = (-(nz - pz) / len) * (widthM / 2);
    const rz = ((nx - px) / len) * (widthM / 2);
    const [x, z] = pts[i];
    const y = heights[i] + liftM;
    out.set([x - rx, y, z - rz, x + rx, y, z + rz], i * 6);
  }
  return out;
}

/** The airfield's pieces in runway coordinates (u along the take-off direction, v to its right), metres. */
export interface AirfieldLayout {
  /** paved rectangles: centre u, v, length, width */
  paved: { u: number; v: number; length: number; width: number; kind: 'runway' | 'taxiway' | 'apron' }[];
  hangars: { u: number; v: number }[];
  tower: { u: number; v: number };
  /** edge lights along both sides of the runway, every 60 m */
  edgeLights: [number, number][];
  /** threshold (green) lights at the start, end (red) lights at the far end */
  thresholdLights: [number, number][];
  endLights: [number, number][];
}

export const TAXIWAY_OFFSET_M = 180;
export const APRON_OFFSET_M = 320;

export function airfieldLayout(a: Airfield): AirfieldLayout {
  const half = a.lengthM / 2;
  const edgeLights: [number, number][] = [];
  for (let u = -half; u <= half + 1e-6; u += 60) edgeLights.push([u, -a.widthM / 2 - 1], [u, a.widthM / 2 + 1]);
  const across = (u: number) => Array.from({ length: 9 }, (_, k): [number, number] => [u, -a.widthM / 2 + (k * a.widthM) / 8]);
  return {
    paved: [
      { u: 0, v: 0, length: a.lengthM, width: a.widthM, kind: 'runway' },
      { u: 0, v: TAXIWAY_OFFSET_M, length: a.lengthM - 200, width: 23, kind: 'taxiway' },
      // Links from the runway edge to the taxiway, and from the taxiway to the apron; none overlap.
      ...[-half + 100, 0, half - 100].map((u) => ({ u, v: (a.widthM / 2 + TAXIWAY_OFFSET_M - 11.5) / 2, length: 23, width: TAXIWAY_OFFSET_M - 11.5 - a.widthM / 2, kind: 'taxiway' as const })),
      ...[-150, 150].map((u) => ({ u, v: (TAXIWAY_OFFSET_M + 11.5 + APRON_OFFSET_M - 75) / 2, length: 23, width: APRON_OFFSET_M - 75 - TAXIWAY_OFFSET_M - 11.5, kind: 'taxiway' as const })),
      { u: 0, v: APRON_OFFSET_M, length: 460, width: 150, kind: 'apron' },
    ],
    hangars: [-180, -90, 90, 180].map((u) => ({ u, v: APRON_OFFSET_M + 105 })),
    tower: { u: 260, v: APRON_OFFSET_M + 40 },
    edgeLights,
    thresholdLights: across(-half),
    endLights: across(half),
  };
}

/** Runway-relative to map coordinates, for meshes and lights. */
export function airfieldPoint(a: Airfield, u: number, v: number): { x: number; z: number } {
  return airfieldWorld(a, u, v);
}

/** The runway designator painted at the threshold: the take-off heading in tens of degrees ("09"). */
export function runwayNumber(headingRad: number): string {
  const deg = (((headingRad * 180) / Math.PI) % 360 + 360) % 360;
  const n = Math.round(deg / 10) || 36;
  return String(n).padStart(2, '0');
}
