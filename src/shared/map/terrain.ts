import { Vector3 } from 'three';
import { clamp, lerp } from '../math/units.ts';

export interface Terrain {
  readonly sizeM: number;
  /** ground (or sea-floor) height */
  heightAt(x: number, z: number): number;
  /** the surface an aircraft can hit: max(height, 0) because the sea surface is at 0 m */
  surfaceAt(x: number, z: number): number;
  normalAt(x: number, z: number, out?: Vector3): Vector3;
  /** true if the straight segment a->b stays above the terrain */
  lineOfSight(a: Vector3, b: Vector3): boolean;
}

const LOS_STEP_M = 250;
const LOS_MAX_SAMPLES = 400;

/** Square height grid centered on the origin with bilinear sampling. */
export class GridTerrain implements Terrain {
  readonly resolution: number;
  readonly sizeM: number;
  readonly cellSize: number;
  /** world coordinate of grid index 0 on both axes */
  readonly origin: number;
  readonly heights: Float32Array;

  constructor(resolution: number, sizeM: number, heights: Float32Array) {
    if (heights.length !== resolution * resolution) {
      throw new Error(`GridTerrain expects ${resolution * resolution} heights, got ${heights.length}`);
    }
    this.resolution = resolution;
    this.sizeM = sizeM;
    this.cellSize = sizeM / (resolution - 1);
    this.origin = -sizeM / 2;
    this.heights = heights;
  }

  static fromFunction(resolution: number, sizeM: number, fn: (x: number, z: number) => number): GridTerrain {
    const heights = new Float32Array(resolution * resolution);
    const cell = sizeM / (resolution - 1);
    const origin = -sizeM / 2;
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) heights[j * resolution + i] = fn(origin + i * cell, origin + j * cell);
    }
    return new GridTerrain(resolution, sizeM, heights);
  }

  heightAt(x: number, z: number): number {
    const n = this.resolution;
    const gx = clamp((x - this.origin) / this.cellSize, 0, n - 1);
    const gz = clamp((z - this.origin) / this.cellSize, 0, n - 1);
    const i = Math.min(Math.floor(gx), n - 2);
    const j = Math.min(Math.floor(gz), n - 2);
    const tx = gx - i;
    const tz = gz - j;
    const h = this.heights;
    const row = j * n;
    const top = lerp(h[row + i], h[row + i + 1], tx);
    const bottom = lerp(h[row + n + i], h[row + n + i + 1], tx);
    return lerp(top, bottom, tz);
  }

  surfaceAt(x: number, z: number): number {
    return Math.max(this.heightAt(x, z), 0);
  }

  normalAt(x: number, z: number, out: Vector3 = new Vector3()): Vector3 {
    const d = this.cellSize;
    const dx = this.heightAt(x + d, z) - this.heightAt(x - d, z);
    const dz = this.heightAt(x, z + d) - this.heightAt(x, z - d);
    return out.set(-dx, 2 * d, -dz).normalize();
  }

  lineOfSight(a: Vector3, b: Vector3): boolean {
    const length = a.distanceTo(b);
    const samples = clamp(Math.ceil(length / LOS_STEP_M), 2, LOS_MAX_SAMPLES);
    for (let k = 1; k < samples; k++) {
      const t = k / samples;
      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y, b.y, t);
      const z = lerp(a.z, b.z, t);
      if (y < this.heightAt(x, z)) return false;
    }
    return true;
  }
}
