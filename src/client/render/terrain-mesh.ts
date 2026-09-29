import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { GridTerrain } from '../../shared/map/terrain.ts';
import { fieldVariation, type RGB255, terrainColor } from './terrain-colors.ts';

const SEA_SIZE_M = 400000;

/** Static chunked terrain whose vertices sit exactly on the simulation's height grid. */
export class TerrainMesh {
  readonly group = new Group();
  readonly chunkCount: number;

  constructor(terrain: GridTerrain, def: MapDefinition, chunkCells = 64) {
    const cells = terrain.resolution - 1;
    const chunksPerSide = Math.ceil(cells / chunkCells);
    const material = new MeshLambertMaterial({ vertexColors: true });
    const normal = new Vector3();
    const color = new Color();
    const rgb: RGB255 = [0, 0, 0];

    for (let cj = 0; cj < chunksPerSide; cj++) {
      for (let ci = 0; ci < chunksPerSide; ci++) {
        const i0 = ci * chunkCells;
        const j0 = cj * chunkCells;
        const nx = Math.min(chunkCells, cells - i0) + 1;
        const nz = Math.min(chunkCells, cells - j0) + 1;
        const centerX = terrain.origin + (i0 + (nx - 1) / 2) * terrain.cellSize;
        const centerZ = terrain.origin + (j0 + (nz - 1) / 2) * terrain.cellSize;
        const positions = new Float32Array(nx * nz * 3);
        const normals = new Float32Array(nx * nz * 3);
        const colors = new Float32Array(nx * nz * 3);

        for (let j = 0; j < nz; j++) {
          for (let i = 0; i < nx; i++) {
            const gi = i0 + i;
            const gj = j0 + j;
            const x = terrain.origin + gi * terrain.cellSize;
            const z = terrain.origin + gj * terrain.cellSize;
            const h = terrain.heights[gj * terrain.resolution + gi];
            const k = (j * nx + i) * 3;
            positions[k] = x - centerX;
            positions[k + 1] = h;
            positions[k + 2] = z - centerZ;
            terrain.normalAt(x, z, normal);
            normals[k] = normal.x;
            normals[k + 1] = normal.y;
            normals[k + 2] = normal.z;
            const cover = def.landCover(x, z, h, 1 - normal.y);
            terrainColor(cover, fieldVariation(x, z), rgb);
            color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace);
            colors[k] = color.r;
            colors[k + 1] = color.g;
            colors[k + 2] = color.b;
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
        geometry.setAttribute('color', new BufferAttribute(colors, 3));
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

    const sea = new Mesh(
      new PlaneGeometry(SEA_SIZE_M, SEA_SIZE_M),
      new MeshStandardMaterial({ color: 0x1f4a66, roughness: 0.3, metalness: 0.05 }),
    );
    sea.name = 'sea';
    sea.rotation.x = -Math.PI / 2;
    this.group.add(sea);
  }
}
