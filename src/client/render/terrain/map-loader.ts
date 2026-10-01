import type { MapDefinition } from '../../../shared/data/maps/map-definition.ts';
import type { MapId } from '../../../shared/data/maps/registry.ts';
import { GridTerrain } from '../../../shared/map/terrain.ts';
import type { LoadProgress } from '../load-progress.ts';
import { buildChunk, type ChunkData, type ChunkKey } from './chunk-builder.ts';
import { buildMapSource, mapFromPayload } from './map-source.ts';
import TerrainWorker from './terrain-worker.ts?worker&inline';
import type { TerrainReply, TerrainRequest } from './terrain-worker.ts';

/** A map ready to fly: its definition, the terrain the simulation samples, and a builder of render chunks. */
export interface LoadedMap {
  id: MapId;
  def: MapDefinition;
  terrain: GridTerrain;
  /** Builds one terrain chunk, in the worker when there is one. */
  requestChunk(key: ChunkKey): Promise<ChunkData>;
}

const loaded = new Map<MapId, Promise<LoadedMap>>();

/**
 * Generates a map in a Web Worker (spec §12.3: terrain built off the page's thread) and keeps the worker for chunk
 * builds. Each map is made once per page; the title screen and every match share it. Without workers it is built on
 * the page instead.
 */
export function loadMap(id: MapId, progress?: LoadProgress): Promise<LoadedMap> {
  let p = loaded.get(id);
  if (!p) {
    p = viaWorker(id).catch((err: unknown) => {
      console.warn('Terrain worker unavailable; building the map on the page.', err);
      return onPage(id);
    });
    loaded.set(id, p);
    if (progress) progress.track(p);
  }
  return p;
}

function viaWorker(id: MapId): Promise<LoadedMap> {
  return new Promise((resolve, reject) => {
    const worker: Worker = new TerrainWorker();
    const waiting = new Map<number, { resolve: (d: ChunkData) => void; reject: (e: Error) => void }>();
    let nextId = 1;
    let ready = false;
    worker.onerror = (e) => {
      const err = new Error(e.message || 'terrain worker failed');
      if (!ready) reject(err);
      for (const w of waiting.values()) w.reject(err);
      waiting.clear();
    };
    worker.onmessage = (e: MessageEvent<TerrainReply>) => {
      const msg = e.data;
      if (msg.type === 'map') {
        ready = true;
        const def = mapFromPayload(msg.payload);
        const terrain = new GridTerrain(def.resolution, def.sizeM, msg.payload.heights);
        resolve({
          id,
          def,
          terrain,
          requestChunk: (key) =>
            new Promise<ChunkData>((res, rej) => {
              const reqId = nextId++;
              waiting.set(reqId, { resolve: res, reject: rej });
              worker.postMessage({ type: 'chunk', id: reqId, key } satisfies TerrainRequest);
            }),
        });
      } else if (msg.type === 'chunk') {
        const w = waiting.get(msg.id);
        waiting.delete(msg.id);
        w?.resolve(msg.data);
      } else if (!ready) {
        reject(new Error(msg.message));
      } else {
        console.error('Terrain worker:', msg.message);
      }
    };
    worker.postMessage({ type: 'init', mapId: id } satisfies TerrainRequest);
  });
}

async function onPage(id: MapId): Promise<LoadedMap> {
  // Let the page paint its loading state before the long build.
  await new Promise((r) => setTimeout(r, 0));
  const source = buildMapSource(id);
  const terrain = new GridTerrain(source.grid.resolution, source.grid.sizeM, source.grid.heights);
  return { id, def: source.def, terrain, requestChunk: async (key) => buildChunk(source.grid, source.coverAt, key) };
}
