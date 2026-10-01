import { generateLechovia, LECHOVIA_RESOLUTION, LECHOVIA_SEED, LECHOVIA_SIZE_M, lechoviaMap } from '../../../shared/data/maps/lechovia/index.ts';
import type { MapDefinition } from '../../../shared/data/maps/map-definition.ts';
import type { MapId } from '../../../shared/data/maps/registry.ts';
import { createTestRange } from '../../../shared/data/maps/test-range.ts';
import type { MapFeatures } from '../../../shared/map/features.ts';
import type { CoverAt, HeightGrid } from './chunk-builder.ts';

/** What a worker sends back once it has made a map: enough for the page to rebuild the same definition. */
export interface MapPayload {
  id: MapId;
  seed: number;
  heights: Float32Array;
  /** Lechovia's land-cover grid; the Test Range computes its cover from functions */
  cover: Uint8Array | null;
  features: MapFeatures | null;
}

/** A generated map as a worker (or the page, without workers) keeps it to build chunks. */
export interface MapSource {
  def: MapDefinition;
  grid: HeightGrid;
  coverAt: CoverAt;
  payload: MapPayload;
}

/** Generates a map (seconds for Lechovia). */
export function buildMapSource(id: MapId): MapSource {
  if (id === 'lechovia') {
    const data = generateLechovia(LECHOVIA_SEED);
    const def = lechoviaMap(data);
    return {
      def,
      grid: { heights: data.heights, resolution: LECHOVIA_RESOLUTION, sizeM: LECHOVIA_SIZE_M },
      coverAt: def.landCover,
      payload: { id, seed: data.seed, heights: data.heights, cover: data.cover, features: data.features },
    };
  }
  const def = createTestRange(1);
  const heights = def.buildHeights();
  return {
    def: { ...def, buildHeights: () => heights },
    grid: { heights, resolution: def.resolution, sizeM: def.sizeM },
    coverAt: def.landCover,
    payload: { id, seed: def.seed, heights, cover: null, features: null },
  };
}

/** The page's copy of a map from a worker's payload, without generating it again. */
export function mapFromPayload(p: MapPayload): MapDefinition {
  if (p.id === 'lechovia' && p.cover && p.features) return lechoviaMap({ seed: p.seed, heights: p.heights, cover: p.cover, features: p.features });
  const def = createTestRange(1);
  return { ...def, buildHeights: () => p.heights };
}
