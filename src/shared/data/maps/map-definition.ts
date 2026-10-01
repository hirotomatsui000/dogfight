import type { MapFeatures } from '../../map/features.ts';
import type { LandCover } from '../../map/land-cover.ts';
import { GridTerrain } from '../../map/terrain.ts';
import type { TeamId } from '../aircraft/types.ts';

export interface SpawnSpec {
  x: number;
  z: number;
  headingRad: number;
  altitudeM: number;
}

export type GroundTargetKind = 'depot' | 'radar' | 'fuel';

/** Where a Strike target stands (spec §12.2). */
export interface GroundTargetSpec {
  id: string;
  kind: GroundTargetKind;
  label: string;
  x: number;
  z: number;
}

/** Strike setup on a map: the three targets and each team's spawn point (spec §12.2). */
export interface StrikeLayout {
  targets: readonly GroundTargetSpec[];
  spawns: Record<TeamId, SpawnSpec>;
}

export interface MapDefinition {
  id: string;
  name: string;
  sizeM: number;
  /** grid samples per side */
  resolution: number;
  seed: number;
  combatArea: { x: number; z: number; radiusM: number };
  spawns: Record<TeamId, SpawnSpec>;
  /** present on maps that host the Strike mode */
  strike?: StrikeLayout;
  /** settlements, roads, rivers and airfields (Lechovia, M4) */
  features?: MapFeatures;
  /**
   * The height grid: resolution² samples, row by row from the north-west corner (index j·resolution + i is
   * x = −size/2 + i·cell, z = −size/2 + j·cell). For runtime sampling use the Terrain built from it.
   */
  buildHeights(): Float32Array;
  /** slope = 1 - normal.y (0 = flat) */
  landCover(x: number, z: number, height: number, slope: number): LandCover;
}

/** Samples a height function on a map's grid. */
export function sampleHeights(resolution: number, sizeM: number, height: (x: number, z: number) => number): Float32Array {
  const heights = new Float32Array(resolution * resolution);
  const cell = sizeM / (resolution - 1);
  const origin = -sizeM / 2;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) heights[j * resolution + i] = height(origin + i * cell, origin + j * cell);
  }
  return heights;
}

export function buildTerrain(def: MapDefinition): GridTerrain {
  return new GridTerrain(def.resolution, def.sizeM, def.buildHeights());
}
