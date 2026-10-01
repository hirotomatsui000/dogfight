import { describe, expect, it } from 'vitest';
import type { LandCover } from '../../../shared/map/land-cover.ts';
import { GridTerrain } from '../../../shared/map/terrain.ts';
import { buildChunk, CHUNK_CELLS, CHUNK_VERTEX_COUNT, CHUNK_VERTS, type ChunkKey, chunkIndices, chunkKeyString, chunkSizeM, skirtDepthM, topLevel } from './chunk-builder.ts';
import { OUTER_RING, selectChunks } from './quadtree.ts';

// 257 samples = 256 cells = 4 chunks of 64 per side at full detail; levels 0..2.
const terrain = GridTerrain.fromFunction(257, 25600, (x, z) => 100 + 0.01 * x - 0.02 * z);
const cover = (x: number): LandCover => (x < 0 ? 'forest' : 'field');

describe('terrain chunks (M4)', () => {
  it('counts levels so the top chunk covers the map', () => {
    expect(topLevel(257)).toBe(2);
    expect(topLevel(2049)).toBe(5);
    expect(topLevel(513)).toBe(3);
    expect(chunkSizeM(terrain, 0) * 4).toBeCloseTo(25600, 6);
    expect(chunkSizeM(terrain, 2)).toBeCloseTo(25600, 6);
  });

  it('puts full-detail vertices exactly on the grid and coarse ones on every other sample', () => {
    for (const key of [
      { level: 0, ci: 1, cj: 2 },
      { level: 1, ci: 1, cj: 0 },
    ]) {
      const c = buildChunk(terrain, cover, key);
      expect(c.positions.length).toBe(CHUNK_VERTEX_COUNT * 3);
      for (const v of [0, 17, CHUNK_VERTS * CHUNK_VERTS - 1]) {
        const x = c.positions[v * 3] + c.centerX;
        const z = c.positions[v * 3 + 2] + c.centerZ;
        expect(c.positions[v * 3 + 1]).toBeCloseTo(terrain.heightAt(x, z), 3);
      }
      const width = c.positions[(CHUNK_VERTS - 1) * 3] - c.positions[0];
      expect(width).toBeCloseTo(chunkSizeM(terrain, key.level), 3);
    }
  });

  it('hangs skirts below every edge and shares one index list', () => {
    const c = buildChunk(terrain, cover, { level: 0, ci: 0, cj: 0 });
    const n = CHUNK_VERTS;
    const skirt = n * n;
    expect(c.positions[skirt * 3 + 1]).toBeCloseTo(c.positions[1] - skirtDepthM(0), 3);
    expect(c.positions[(skirt + 3 * n + n - 1) * 3 + 1]).toBeCloseTo(c.positions[(n * n - 1) * 3 + 1] - skirtDepthM(0), 3);
    const indices = chunkIndices();
    expect(indices.length).toBe(CHUNK_CELLS * CHUNK_CELLS * 6 + 4 * CHUNK_CELLS * 6);
    expect(Math.max(...indices)).toBe(CHUNK_VERTEX_COUNT - 1);
  });

  it('stores land classes, overlays and normals per vertex', () => {
    const west = buildChunk(terrain, cover, { level: 0, ci: 0, cj: 0 });
    expect([...west.landClass.slice(20, 24)]).toEqual([0, 255, 0, 0]);
    expect([...west.landExtra.slice(20, 24)]).toEqual([0, 0, 0, 0]);
    // The plane rises to the east and falls to the south: the normal leans west and south.
    expect(west.normals[0]).toBeLessThan(0);
    expect(west.normals[1]).toBeGreaterThan(120);
    expect(west.normals[2]).toBeGreaterThan(0);
    expect(west.maxY).toBeGreaterThan(west.minY);
  });

  it('stretches the edge heights out beyond the map', () => {
    const outside = buildChunk(terrain, cover, { level: 2, ci: 1, cj: 0 });
    const edge = terrain.heightAt(12800, outside.positions[2] + outside.centerZ);
    expect(outside.positions[1]).toBeCloseTo(edge, 3);
    expect(outside.positions[0] + outside.centerX).toBeCloseTo(12800, 3);
  });
});

describe('quadtree selection (M4)', () => {
  const params = { top: 2, sizeM: 25600, splitFactor: 1, heightRange: () => [0, 300] as const };
  const area = (keys: ChunkKey[]) => keys.filter((k) => k.ci >= 0 && k.cj >= 0 && k.ci < 1 << (2 - k.level) && k.cj < 1 << (2 - k.level)).reduce((s, k) => s + (25600 / (1 << (2 - k.level))) ** 2, 0);

  it('draws full detail near the camera, coarser chunks far away, and tiles the map exactly once', () => {
    const { draw, missing } = selectChunks(params, { x: -12000, y: 500, z: -12000 }, () => true);
    expect(missing).toEqual([]);
    expect(area(draw)).toBeCloseTo(25600 * 25600, 0);
    expect(draw.find((k) => k.ci === 0 && k.cj === 0)?.level).toBe(0);
    expect(draw.some((k) => k.level === 1)).toBe(true);
    expect(new Set(draw.map(chunkKeyString)).size).toBe(draw.length);
    expect(draw.filter((k) => k.ci < 0 || k.cj < 0 || k.ci > 0 || k.cj > 0).length).toBeGreaterThanOrEqual(OUTER_RING.length);
  });

  it('stays coarse from high up', () => {
    const { draw } = selectChunks(params, { x: 0, y: 80000, z: 0 }, () => true);
    expect(draw.filter((k) => k.level === 2)).toHaveLength(9);
  });

  it('keeps a parent on screen until all its children are built, and asks for the coarse ones first', () => {
    const ready = new Set([chunkKeyString({ level: 2, ci: 0, cj: 0 })]);
    const { draw, missing } = selectChunks(params, { x: -12000, y: 500, z: -12000 }, (k) => ready.has(chunkKeyString(k)));
    expect(draw.filter((k) => k.ci === 0 && k.cj === 0 && k.level === 2)).toHaveLength(1);
    expect(area(draw)).toBeCloseTo(25600 * 25600, 0);
    expect(missing[0].level).toBe(2);
    expect(missing.some((k) => k.level === 0)).toBe(true);
    const levels = missing.map((k) => k.level);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
  });
});
