import type { BufferGeometry, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import type { MapDefinition } from '../../shared/data/maps/map-definition.ts';
import { GridTerrain } from '../../shared/map/terrain.ts';
import { TerrainMesh } from './terrain-mesh.ts';

const def = {
  landCover: () => 'field',
} as unknown as MapDefinition;

describe('TerrainMesh', () => {
  const terrain = GridTerrain.fromFunction(129, 12800, (x, z) => 50 + 0.01 * x - 0.02 * z);
  const mesh = new TerrainMesh(terrain, def, 32);

  it('splits the grid into chunks', () => {
    expect(mesh.chunkCount).toBe(16);
  });
  it('places vertices exactly on the terrain grid heights', () => {
    const chunk = mesh.group.children.find((c) => c.name === 'terrain-chunk-0-0') as Mesh | undefined;
    expect(chunk).toBeDefined();
    if (!chunk) return;
    const pos = (chunk.geometry as BufferGeometry).getAttribute('position');
    for (const k of [0, 17, 500, pos.count - 1]) {
      const wx = pos.getX(k) + chunk.position.x;
      const wz = pos.getZ(k) + chunk.position.z;
      expect(pos.getY(k)).toBeCloseTo(terrain.heightAt(wx, wz), 3);
    }
  });
});
