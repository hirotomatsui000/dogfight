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
  /** height generator used to build the grid (not for runtime sampling — use Terrain) */
  height(x: number, z: number): number;
  /** slope = 1 - normal.y (0 = flat) */
  landCover(x: number, z: number, height: number, slope: number): LandCover;
}

export function buildTerrain(def: MapDefinition): GridTerrain {
  return GridTerrain.fromFunction(def.resolution, def.sizeM, (x, z) => def.height(x, z));
}
