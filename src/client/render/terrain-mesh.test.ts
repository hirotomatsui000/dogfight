import { type BufferGeometry, type Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { MapDefinition } from '../../shared/data/maps/map-definition.ts';
import { GridTerrain } from '../../shared/map/terrain.ts';
import { TerrainMesh } from './terrain-mesh.ts';

const def = {
  landCover: (x: number) => (x < 0 ? 'forest' : 'field'),
} as unknown as MapDefinition;

describe('TerrainMesh', () => {
  const terrain = GridTerrain.fromFunction(129, 12800, (x, z) => 50 + 0.01 * x - 0.02 * z);
  const material = new MeshBasicMaterial();
  const mesh = new TerrainMesh(terrain, def, material, 32);
  const chunk = mesh.group.children.find((c) => c.name === 'terrain-chunk-0-0') as Mesh;
  const geometry = chunk.geometry as BufferGeometry;

  it('splits the grid into chunks that share the given material', () => {
    expect(mesh.chunkCount).toBe(16);
    expect(mesh.group.children).toHaveLength(16);
    expect(chunk.material).toBe(material);
  });
  it('places vertices exactly on the terrain grid heights', () => {
    const pos = geometry.getAttribute('position');
    for (const k of [0, 17, 500, pos.count - 1]) {
      const wx = pos.getX(k) + chunk.position.x;
      const wz = pos.getZ(k) + chunk.position.z;
      expect(pos.getY(k)).toBeCloseTo(terrain.heightAt(wx, wz), 3);
    }
  });
  it('stores land-class weights per vertex for the satellite-texture shader', () => {
    const landClass = geometry.getAttribute('landClass');
    const landExtra = geometry.getAttribute('landExtra');
    expect(landClass.itemSize).toBe(4);
    expect(landExtra.itemSize).toBe(2);
    // chunk 0-0 lies entirely at x < 0, which this map calls forest: (farm, forest, mountain, sand) = (0, 1, 0, 0)
    expect([landClass.getX(5), landClass.getY(5), landClass.getZ(5), landClass.getW(5)]).toEqual([0, 1, 0, 0]);
    expect([landExtra.getX(5), landExtra.getY(5)]).toEqual([0, 0]);
  });
});
