import type { MapId } from '../../../shared/data/maps/registry.ts';
import { buildChunk, type ChunkData, type ChunkKey } from './chunk-builder.ts';
import { buildMapSource, type MapPayload, type MapSource } from './map-source.ts';

/** Messages to the terrain worker. */
export type TerrainRequest = { type: 'init'; mapId: MapId } | { type: 'chunk'; id: number; key: ChunkKey };

/** Messages from the terrain worker. */
export type TerrainReply = { type: 'map'; payload: MapPayload } | { type: 'chunk'; id: number; data: ChunkData } | { type: 'error'; message: string };

/** The parts of the worker's global scope used here (the page's DOM types describe `self` otherwise). */
interface WorkerScope {
  onmessage: ((e: MessageEvent<TerrainRequest>) => void) | null;
  postMessage(msg: TerrainReply, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
let source: MapSource | null = null;

// Generates the map off the page's thread (a few seconds for Lechovia), then builds terrain chunks on request.
scope.onmessage = (e: MessageEvent<TerrainRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      source = buildMapSource(msg.mapId);
      // Copied, not transferred: the worker keeps its own grids for building chunks.
      scope.postMessage({ type: 'map', payload: source.payload });
    } else if (msg.type === 'chunk' && source) {
      const data = buildChunk(source.grid, source.coverAt, msg.key);
      scope.postMessage({ type: 'chunk', id: msg.id, data }, [data.positions.buffer, data.normals.buffer, data.landClass.buffer, data.landExtra.buffer]);
    }
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
