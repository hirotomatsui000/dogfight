import { LECHOVIA_ID } from './lechovia/index.ts';

export type MapId = 'lechovia' | 'test-range';

/** Maps a match can be flown on, the default first (spec §12). */
export const MAP_IDS: readonly MapId[] = [LECHOVIA_ID, 'test-range'];

export const MAP_NAMES: Readonly<Record<MapId, string>> = { lechovia: 'Lechovia', 'test-range': 'Test range' };
