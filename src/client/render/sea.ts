import { Mesh, MeshStandardMaterial, PlaneGeometry, type Texture, Vector2 } from 'three';

const SEA_SIZE_M = 400000;
const WAVE_TILE_M = 90;
const WAVE_DRIFT_TILES_PER_S = 0.02;

/** Open sea at 0 m: animated photo normal map, sky reflections from the environment map and sun glitter. */
export class Sea {
  readonly mesh: Mesh;
  private readonly normals: Texture;

  constructor(waterNormals: Texture) {
    this.normals = waterNormals;
    this.normals.repeat.set(SEA_SIZE_M / WAVE_TILE_M, SEA_SIZE_M / WAVE_TILE_M);
    const material = new MeshStandardMaterial({
      color: 0x082233,
      roughness: 0.3,
      metalness: 0,
      normalMap: this.normals,
      normalScale: new Vector2(0.7, 0.7),
    });
    this.mesh = new Mesh(new PlaneGeometry(SEA_SIZE_M, SEA_SIZE_M), material);
    this.mesh.name = 'sea';
    this.mesh.rotation.x = -Math.PI / 2;
  }

  update(timeS: number): void {
    this.normals.offset.set(timeS * WAVE_DRIFT_TILES_PER_S, timeS * WAVE_DRIFT_TILES_PER_S * 0.6);
  }
}
