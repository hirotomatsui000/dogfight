import type { Road } from '../../../map/features.ts';
import { COVER_CODE } from '../../../map/land-cover.ts';

/** The fine grids the router reads (Lechovia's heights and land cover). */
export interface RouteGrid {
  heights: Float32Array;
  cover: Uint8Array;
  resolution: number;
  sizeM: number;
}

/** Roads are routed on a coarse grid of this spacing, then smoothed. */
export const ROUTE_STEP_M = 500;
/** Climbing costs this many metres of extra road per metre of height. */
const CLIMB_COST = 20;
/** A bridge costs like this much extra road. */
const BRIDGE_COST_M = 4000;
const SEA = COVER_CODE.sea;
const LAKE = COVER_CODE.lake;
const RIVER = COVER_CODE.river;

const NEIGHBORS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** A min-heap of node indices keyed by a score array. */
class Heap {
  private readonly items: number[] = [];
  private readonly score: Float64Array;
  constructor(score: Float64Array) {
    this.score = score;
  }
  get size(): number {
    return this.items.length;
  }
  push(n: number): void {
    const a = this.items;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop() as number;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Routes roads over terrain cost: rivers need bridges, lakes and the sea are impassable (spec §12.3). */
export class RoadRouter {
  readonly n: number;
  private readonly origin: number;
  private readonly h: Float32Array;
  private readonly water: Uint8Array;
  private readonly river: Uint8Array;
  /** nodes already on a road */
  readonly network: Uint8Array;
  private readonly g: Float64Array;
  private readonly f: Float64Array;
  private readonly from: Int32Array;
  private readonly closed: Uint8Array;

  constructor(grid: RouteGrid) {
    this.n = Math.floor(grid.sizeM / ROUTE_STEP_M) + 1;
    this.origin = -grid.sizeM / 2;
    const count = this.n * this.n;
    this.h = new Float32Array(count);
    this.water = new Uint8Array(count);
    this.river = new Uint8Array(count);
    const cell = grid.sizeM / (grid.resolution - 1);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const fi = Math.min(grid.resolution - 1, Math.round((i * ROUTE_STEP_M) / cell));
        const fj = Math.min(grid.resolution - 1, Math.round((j * ROUTE_STEP_M) / cell));
        const k = j * this.n + i;
        const fk = fj * grid.resolution + fi;
        this.h[k] = grid.heights[fk];
        const c = grid.cover[fk];
        this.water[k] = c === SEA || c === LAKE ? 1 : 0;
        this.river[k] = c === RIVER ? 1 : 0;
      }
    }
    this.network = new Uint8Array(count);
    this.g = new Float64Array(count);
    this.f = new Float64Array(count);
    this.from = new Int32Array(count);
    this.closed = new Uint8Array(count);
  }

  /** The dry node nearest to a point, searching outward up to 5 km. */
  nodeNear(x: number, z: number): number {
    const ci = Math.round((x - this.origin) / ROUTE_STEP_M);
    const cj = Math.round((z - this.origin) / ROUTE_STEP_M);
    for (let r = 0; r <= 10; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let j = cj - r; j <= cj + r; j++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
          const k = j * this.n + i;
          if (this.water[k] || this.river[k]) continue;
          const d = (i - ci) ** 2 + (j - cj) ** 2;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
      }
      if (best >= 0) return best;
    }
    return cj * this.n + ci;
  }

  nodeX(k: number): number {
    return this.origin + (k % this.n) * ROUTE_STEP_M;
  }

  nodeZ(k: number): number {
    return this.origin + Math.floor(k / this.n) * ROUTE_STEP_M;
  }

  /**
   * Cheapest path from `start` to `goal`, or to any node already on the network when `goal` is -1. Null when nothing
   * is reachable within `maxCostM`.
   */
  route(start: number, goal: number, maxCostM = Infinity): number[] | null {
    const n = this.n;
    this.g.fill(Infinity);
    this.closed.fill(0);
    this.from.fill(-1);
    const gx = goal >= 0 ? goal % n : 0;
    const gz = goal >= 0 ? Math.floor(goal / n) : 0;
    const heuristic = (k: number) => (goal >= 0 ? Math.hypot((k % n) - gx, Math.floor(k / n) - gz) * ROUTE_STEP_M : 0);
    const open = new Heap(this.f);
    this.g[start] = 0;
    this.f[start] = heuristic(start);
    open.push(start);
    while (open.size > 0) {
      const k = open.pop();
      if (this.closed[k]) continue;
      this.closed[k] = 1;
      if (k === goal || (goal < 0 && k !== start && this.network[k])) return this.path(k);
      if (this.g[k] > maxCostM) return null;
      const i = k % n;
      const j = Math.floor(k / n);
      for (const [di, dj] of NEIGHBORS) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const m = nj * n + ni;
        if (this.closed[m] || this.water[m]) continue;
        const len = di !== 0 && dj !== 0 ? ROUTE_STEP_M * Math.SQRT2 : ROUTE_STEP_M;
        const cost = len + CLIMB_COST * Math.abs(this.h[m] - this.h[k]) + (this.river[m] ? BRIDGE_COST_M : 0);
        const g = this.g[k] + cost;
        if (g < this.g[m]) {
          this.g[m] = g;
          this.f[m] = g + heuristic(m);
          this.from[m] = k;
          open.push(m);
        }
      }
    }
    return null;
  }

  /** Marks a path's nodes as road, so later roads join it. */
  addToNetwork(path: readonly number[]): void {
    for (const k of path) this.network[k] = 1;
  }

  private path(end: number): number[] {
    const out: number[] = [];
    for (let k = end; k >= 0; k = this.from[k]) out.push(k);
    return out.reverse();
  }

  /** A smooth polyline through a node path (two rounds of Chaikin corner cutting; the ends stay put). */
  toRoad(path: readonly number[], kind: Road['kind']): Road {
    let pts: [number, number][] = path.map((k) => [this.nodeX(k), this.nodeZ(k)]);
    for (let round = 0; round < 2 && pts.length > 2; round++) {
      const next: [number, number][] = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        if (i > 0) next.push([0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz]);
        if (i < pts.length - 2) next.push([0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz]);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
    }
    return { kind, points: pts.flatMap(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]) };
  }
}
