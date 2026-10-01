import { LAND_COVERS, type LandCover } from '../../../map/land-cover.ts';
import type { MapDefinition } from '../map-definition.ts';
import { generateLechovia, LECHOVIA_RESOLUTION, LECHOVIA_SIZE_M, type LechoviaData } from './generate.ts';

export { generateLechovia, LECHOVIA_RESOLUTION, LECHOVIA_SIZE_M, type LechoviaData } from './generate.ts';

export const LECHOVIA_ID = 'lechovia';
export const LECHOVIA_SEED = 1;

const CELL = LECHOVIA_SIZE_M / (LECHOVIA_RESOLUTION - 1);
const ORIGIN = -LECHOVIA_SIZE_M / 2;

/**
 * Lechovia (spec §12.3) from generated data: the map definition the World, the renderer and the map screen use. The
 * fronts meet over the capital: each team's airborne spawn line is 15 km from the centre at 5,000 m, its airfield
 * near the west or east edge of the 85 km combat area.
 */
export function lechoviaMap(data: LechoviaData): MapDefinition {
  const n = LECHOVIA_RESOLUTION;
  return {
    id: LECHOVIA_ID,
    name: 'Lechovia',
    sizeM: LECHOVIA_SIZE_M,
    resolution: n,
    seed: data.seed,
    combatArea: { x: 0, z: 0, radiusM: 85000 },
    spawns: {
      usa: { x: -15000, z: 0, headingRad: Math.PI / 2, altitudeM: 5000 },
      russia: { x: 15000, z: 0, headingRad: (3 * Math.PI) / 2, altitudeM: 5000 },
    },
    features: data.features,
    buildHeights: () => data.heights,
    landCover: (x: number, z: number): LandCover => {
      const i = Math.min(n - 1, Math.max(0, Math.round((x - ORIGIN) / CELL)));
      const j = Math.min(n - 1, Math.max(0, Math.round((z - ORIGIN) / CELL)));
      return LAND_COVERS[data.cover[j * n + i]] ?? 'field';
    },
  };
}

const cache = new Map<number, MapDefinition>();

/** Lechovia for a seed, generated once per process (the server, tests and tools). */
export function createLechovia(seed = LECHOVIA_SEED): MapDefinition {
  let def = cache.get(seed);
  if (!def) {
    def = lechoviaMap(generateLechovia(seed));
    cache.set(seed, def);
  }
  return def;
}
