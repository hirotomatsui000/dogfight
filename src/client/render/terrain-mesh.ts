import { BufferAttribute, BufferGeometry, Group, type Material, Mesh, Vector3 } from 'three';
import type { MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { GridTerrain } from '../../shared/map/terrain.ts';
import { landClassWeights } from './land-class.ts';

/**
 * Static chunked terrain whose vertices sit exactly on the simulation's height grid.
 * Each vertex carries land-class weights (`landClass` = farm, forest, mountain, sand; `landExtra` = water, snow)
 * that the terrain material uses to blend satellite photos.
 */
export class TerrainMesh {
  readonly group = new Group();
  readonly chunkCount: number;

  constructor(terrain: GridTerrain, def: MapDefinition, material: Material, chunkCells = 64) {
    const cells = terrain.resolution - 1;
    const chunksPerSide = Math.ceil(cells / chunkCells);
    const normal = new Vector3();

    for (let cj = 0; cj < chunksPerSide; cj++) {
      for (let ci = 0; ci < chunksPerSide; ci++) {
        const i0 = ci * chunkCells;
        const j0 = cj * chunkCells;
        const nx = Math.min(chunkCells, cells - i0) + 1;
        const nz = Math.min(chunkCells, cells - j0) + 1;
        const centerX = terrain.origin + (i0 + (nx - 1) / 2) * terrain.cellSize;
        const centerZ = terrain.origin + (j0 + (nz - 1) / 2) * terrain.cellSize;
        const count = nx * nz;
        const positions = new Float32Array(count * 3);
        const normals = new Float32Array(count * 3);
        const landClass = new Float32Array(count * 4);
        const landExtra = new Float32Array(count * 2);

        for (let j = 0; j < nz; j++) {
          for (let i = 0; i < nx; i++) {
            const gi = i0 + i;
            const gj = j0 + j;
            const x = terrain.origin + gi * terrain.cellSize;
            const z = terrain.origin + gj * terrain.cellSize;
            const h = terrain.heights[gj * terrain.resolution + gi];
            const v = j * nx + i;
            positions.set([x - centerX, h, z - centerZ], v * 3);
            terrain.normalAt(x, z, normal);
            normals.set([normal.x, normal.y, normal.z], v * 3);
            const w = landClassWeights(def.landCover(x, z, h, 1 - normal.y));
            landClass.set([w.farm, w.forest, w.mountain, w.sand], v * 4);
            landExtra.set([w.water, w.snow], v * 2);
          }
        }

        const indices: number[] = [];
        for (let j = 0; j < nz - 1; j++) {
          for (let i = 0; i < nx - 1; i++) {
            const a = j * nx + i;
            const b = a + 1;
            const c = a + nx;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
          }
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new BufferAttribute(normals, 3));
        geometry.setAttribute('landClass', new BufferAttribute(landClass, 4));
        geometry.setAttribute('landExtra', new BufferAttribute(landExtra, 2));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        const mesh = new Mesh(geometry, material);
        mesh.name = `terrain-chunk-${ci}-${cj}`;
        mesh.position.set(centerX, 0, centerZ);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.group.add(mesh);
      }
    }
    this.chunkCount = chunksPerSide * chunksPerSide;
  }
}
