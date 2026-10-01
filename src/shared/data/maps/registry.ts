import { createLechovia, LECHOVIA_ID } from './lechovia/index.ts';
import type { MapDefinition } from './map-definition.ts';
import { createTestRange } from './test-range.ts';

export type MapId = 'lechovia' | 'test-range';

/** Maps a match can be flown on, the default first (spec §12). */
export const MAP_IDS: readonly MapId[] = [LECHOVIA_ID, 'test-range'];

export const MAP_NAMES: Readonly<Record<MapId, string>> = { lechovia: 'Lechovia', 'test-range': 'Test range' };

export function isMapId(v: unknown): v is MapId {
  return MAP_IDS.some((m) => m === v);
}

/** Builds a map definition (Lechovia is generated once per process and cached). */
export function createMap(id: MapId): MapDefinition {
  return id === 'lechovia' ? createLechovia() : createTestRange(1);
}
