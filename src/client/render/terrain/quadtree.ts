import type { ChunkKey } from './chunk-builder.ts';

export interface LodParams {
  /** the coarsest level: one chunk covers the map */
  top: number;
  /** map width, metres (centred on the origin) */
  sizeM: number;
  /** a chunk splits into four when the camera is closer than this many chunk widths */
  splitFactor: number;
  /** lowest and highest ground in a chunk, for the distance test (a guess until it is built) */
  heightRange(key: ChunkKey): readonly [number, number];
}

export interface Selection {
  /** chunks to draw: they tile the map once, plus the ring beyond its edges */
  draw: ChunkKey[];
  /** chunks wanted but not built yet, coarse and near first */
  missing: ChunkKey[];
}

/** The eight top-level chunks around the map that carry its edges out to the horizon. */
export const OUTER_RING: readonly [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Quadtree level-of-detail selection: near chunks at full detail, coarser with distance. A chunk whose children are
 * not all built yet stands in for them, so the ground never has holes while the worker catches up.
 */
export function selectChunks(p: LodParams, camera: { x: number; y: number; z: number }, isReady: (key: ChunkKey) => boolean): Selection {
  const draw: ChunkKey[] = [];
  const missing: { key: ChunkKey; d: number }[] = [];
  const origin = -p.sizeM / 2;
  const distance = (key: ChunkKey) => {
    const size = p.sizeM / (1 << (p.top - key.level));
    const cx = origin + (key.ci + 0.5) * size;
    const cz = origin + (key.cj + 0.5) * size;
    const [lo, hi] = p.heightRange(key);
    const dx = Math.max(0, Math.abs(camera.x - cx) - size / 2);
    const dz = Math.max(0, Math.abs(camera.z - cz) - size / 2);
    const dy = Math.max(0, camera.y - hi, lo - camera.y);
    return { d: Math.hypot(dx, dy, dz), size };
  };
  const visit = (key: ChunkKey, out: ChunkKey[]): boolean => {
    const { d, size } = distance(key);
    if (key.level > 0 && d < p.splitFactor * size) {
      const children: ChunkKey[] = [];
      let all = true;
      for (const [di, dj] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        all = visit({ level: key.level - 1, ci: key.ci * 2 + di, cj: key.cj * 2 + dj }, children) && all;
      }
      if (all) {
        out.push(...children);
        return true;
      }
    }
    if (isReady(key)) {
      out.push(key);
      return true;
    }
    missing.push({ key, d });
    return false;
  };
  visit({ level: p.top, ci: 0, cj: 0 }, draw);
  for (const [ci, cj] of OUTER_RING) {
    const key = { level: p.top, ci, cj };
    if (isReady(key)) draw.push(key);
    else missing.push({ key, d: Infinity });
  }
  missing.sort((a, b) => b.key.level - a.key.level || a.d - b.d);
  return { draw, missing: missing.map((m) => m.key) };
}
