import type { LandCover } from '../../../shared/map/land-cover.ts';
import { landClassWeights } from '../land-class.ts';

/** Cells along one side of a terrain chunk at every level of detail. */
export const CHUNK_CELLS = 64;
/** Vertices along one side of a chunk. */
export const CHUNK_VERTS = CHUNK_CELLS + 1;
const SKIRT_VERTS = 4 * CHUNK_VERTS;
export const CHUNK_VERTEX_COUNT = CHUNK_VERTS * CHUNK_VERTS + SKIRT_VERTS;

/** The height grid a chunk samples (a GridTerrain or the raw arrays a worker holds). */
export interface HeightGrid {
  readonly heights: Float32Array;
  readonly resolution: number;
  readonly sizeM: number;
}

export type CoverAt = (x: number, z: number, height: number, slope: number) => LandCover;

/** A quadtree node: level 0 is full resolution; each level up doubles the vertex spacing. */
export interface ChunkKey {
  level: number;
  ci: number;
  cj: number;
}

/** Plain arrays for one terrain chunk, built in a worker and handed to the page. */
export interface ChunkData extends ChunkKey {
  /** chunk centre in the map frame; positions are relative to it */
  centerX: number;
  centerZ: number;
  positions: Float32Array;
  /** Int8, normalized */
  normals: Int8Array;
  /** farm, forest, mountain, sand weights, Uint8 normalized */
  landClass: Uint8Array;
  /** water, snow, urban, marsh weights, Uint8 normalized */
  landExtra: Uint8Array;
  minY: number;
  maxY: number;
}

export function chunkKeyString(k: ChunkKey): string {
  return `${k.level}/${k.ci}/${k.cj}`;
}

/** Levels of detail above full resolution: the top level covers the map with one chunk. */
export function topLevel(resolution: number): number {
  return Math.round(Math.log2((resolution - 1) / CHUNK_CELLS));
}

/** Width of a chunk at a level, in metres. */
export function chunkSizeM(grid: HeightGrid, level: number): number {
  return ((grid.sizeM / (grid.resolution - 1)) * CHUNK_CELLS) << level;
}

/** Skirts hang below the chunk edges to hide cracks where neighbours of different detail meet. */
export function skirtDepthM(level: number): number {
  return 15 + 25 * (1 << level);
}

/**
 * The triangle list every chunk shares: the grid, then a skirt strip down each edge. Counter-clockwise from above.
 */
export function chunkIndices(): Uint16Array {
  const n = CHUNK_VERTS;
  const out: number[] = [];
  for (let j = 0; j < CHUNK_CELLS; j++) {
    for (let i = 0; i < CHUNK_CELLS; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      out.push(a, c, b, b, c, d);
    }
  }
  // Skirt vertices follow the grid: north edge (j = 0), south (j = n−1), west (i = 0), east (i = n−1).
  const base = n * n;
  const edges: [number, (k: number) => number, boolean][] = [
    [base, (k) => k, true],
    [base + n, (k) => (n - 1) * n + k, false],
    [base + 2 * n, (k) => k * n, false],
    [base + 3 * n, (k) => k * n + n - 1, true],
  ];
  for (const [start, edge, flip] of edges) {
    for (let k = 0; k < CHUNK_CELLS; k++) {
      const top0 = edge(k);
      const top1 = edge(k + 1);
      const low0 = start + k;
      const low1 = start + k + 1;
      if (flip) out.push(top0, top1, low0, top1, low1, low0);
      else out.push(top0, low0, top1, top1, low0, low1);
    }
  }
  return new Uint16Array(out);
}

/**
 * Builds one chunk. Chunks outside the map (`ci`/`cj` of −1 or past the end, only at the top level) stretch the edge
 * heights outward, so the land runs on to the horizon instead of stopping at a cliff.
 */
export function buildChunk(grid: HeightGrid, coverAt: CoverAt, key: ChunkKey): ChunkData {
  const res = grid.resolution;
  const cell = grid.sizeM / (res - 1);
  const origin = -grid.sizeM / 2;
  const step = 1 << key.level;
  const i0 = key.ci * CHUNK_CELLS * step;
  const j0 = key.cj * CHUNK_CELLS * step;
  const n = CHUNK_VERTS;
  const centerX = origin + (i0 + (CHUNK_CELLS * step) / 2) * cell;
  const centerZ = origin + (j0 + (CHUNK_CELLS * step) / 2) * cell;
  const h = grid.heights;
  const at = (i: number, j: number) => h[Math.min(res - 1, Math.max(0, j)) * res + Math.min(res - 1, Math.max(0, i))];

  const positions = new Float32Array(CHUNK_VERTEX_COUNT * 3);
  const normals = new Int8Array(CHUNK_VERTEX_COUNT * 3);
  const landClass = new Uint8Array(CHUNK_VERTEX_COUNT * 4);
  const landExtra = new Uint8Array(CHUNK_VERTEX_COUNT * 4);
  let minY = Infinity;
  let maxY = -Infinity;
  const toByte = (w: number) => Math.round(Math.min(1, Math.max(0, w)) * 255);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gi = i0 + i * step;
      const gj = j0 + j * step;
      const y = at(gi, gj);
      const x = origin + gi * cell;
      const z = origin + gj * cell;
      const v = j * n + i;
      positions[v * 3] = x - centerX;
      positions[v * 3 + 1] = y;
      positions[v * 3 + 2] = z - centerZ;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      // Normal from the grid around the vertex, over the chunk's own spacing so far terrain is shaded smoothly.
      const dx = (at(gi + step, gj) - at(gi - step, gj)) / (2 * step * cell);
      const dz = (at(gi, gj + step) - at(gi, gj - step)) / (2 * step * cell);
      const len = Math.hypot(dx, 1, dz);
      normals[v * 3] = Math.round((-dx / len) * 127);
      normals[v * 3 + 1] = Math.round((1 / len) * 127);
      normals[v * 3 + 2] = Math.round((-dz / len) * 127);
      const w = landClassWeights(coverAt(x, z, y, 1 - 1 / len));
      landClass.set([toByte(w.farm), toByte(w.forest), toByte(w.mountain), toByte(w.sand)], v * 4);
      landExtra.set([toByte(w.water), toByte(w.snow), toByte(w.urban), toByte(w.marsh)], v * 4);
    }
  }

  // Skirts: copies of the edge vertices, lowered.
  const drop = skirtDepthM(key.level);
  const copy = (from: number, to: number) => {
    positions[to * 3] = positions[from * 3];
    positions[to * 3 + 1] = positions[from * 3 + 1] - drop;
    positions[to * 3 + 2] = positions[from * 3 + 2];
    normals.copyWithin(to * 3, from * 3, from * 3 + 3);
    landClass.copyWithin(to * 4, from * 4, from * 4 + 4);
    landExtra.copyWithin(to * 4, from * 4, from * 4 + 4);
  };
  const base = n * n;
  for (let k = 0; k < n; k++) {
    copy(k, base + k);
    copy((n - 1) * n + k, base + n + k);
    copy(k * n, base + 2 * n + k);
    copy(k * n + n - 1, base + 3 * n + k);
  }
  return { ...key, centerX, centerZ, positions, normals, landClass, landExtra, minY, maxY };
}
