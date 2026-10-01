import { BufferAttribute, BufferGeometry, Group, type Material, Mesh, Sphere, Vector3 } from 'three';
import { type ChunkData, type ChunkKey, chunkIndices, chunkKeyString, chunkSizeM, skirtDepthM, topLevel } from './chunk-builder.ts';
import type { LoadedMap } from './map-loader.ts';
import { selectChunks } from './quadtree.ts';

/** Chunk builds waiting in the worker at once; more queue up for later frames. */
const MAX_IN_FLIGHT = 8;
/** Built chunks kept for reuse when the camera comes back. */
const MAX_MESHES = 360;

interface Entry {
  mesh: Mesh;
  usedFrame: number;
  minY: number;
  maxY: number;
}

/**
 * The ground as a quadtree of chunks (spec §12.3): full detail near the camera, coarser with distance, built in the
 * map's worker. Parents stay on screen until all their children have arrived.
 */
export class TerrainLod {
  readonly group = new Group();
  /** a chunk splits when the camera is closer than this many chunk widths (graphics preset) */
  splitFactor: number;
  private readonly map: LoadedMap;
  private readonly material: Material;
  /** every chunk has the same triangles; each geometry gets its own GPU buffer of them (three frees a geometry's index with it) */
  private readonly indices = chunkIndices();
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Set<string>();
  private readonly top: number;
  private readonly heightSpan: readonly [number, number];
  private frame = 0;
  private disposed = false;
  private arrivals: (() => void)[] = [];

  constructor(map: LoadedMap, material: Material, splitFactor = 1.6) {
    this.map = map;
    this.material = material;
    this.splitFactor = splitFactor;
    this.top = topLevel(map.terrain.resolution);
    let lo = Infinity;
    let hi = -Infinity;
    const h = map.terrain.heights;
    for (let k = 0; k < h.length; k += 7) {
      lo = Math.min(lo, h[k]);
      hi = Math.max(hi, h[k]);
    }
    this.heightSpan = [lo, hi];
    this.group.name = 'terrain';
  }

  /** Picks the chunks for this camera position, shows them, and asks the worker for missing ones. */
  update(camera: Vector3): number {
    this.frame++;
    const sel = selectChunks(
      {
        top: this.top,
        sizeM: this.map.terrain.sizeM,
        splitFactor: this.splitFactor,
        heightRange: (k) => {
          const e = this.entries.get(chunkKeyString(k));
          return e ? [e.minY, e.maxY] : this.heightSpan;
        },
      },
      camera,
      (k) => this.entries.has(chunkKeyString(k)),
    );
    for (const e of this.entries.values()) e.mesh.visible = false;
    for (const k of sel.draw) {
      const e = this.entries.get(chunkKeyString(k));
      if (!e) continue;
      e.mesh.visible = true;
      e.usedFrame = this.frame;
    }
    for (const k of sel.missing) {
      if (this.inFlight.size >= MAX_IN_FLIGHT) break;
      this.request(k);
    }
    this.evict();
    return sel.missing.length;
  }

  /** Resolves once everything this camera position wants is built (before the first frame of a match). */
  async prepare(camera: Vector3): Promise<void> {
    while (!this.disposed && this.update(camera) > 0) await new Promise<void>((r) => this.arrivals.push(r));
  }

  dispose(): void {
    this.disposed = true;
    for (const e of this.entries.values()) e.mesh.geometry.dispose();
    this.entries.clear();
    this.group.clear();
    for (const r of this.arrivals) r();
    this.arrivals = [];
  }

  private request(key: ChunkKey): void {
    const id = chunkKeyString(key);
    if (this.inFlight.has(id) || this.entries.has(id)) return;
    this.inFlight.add(id);
    this.map.requestChunk(key).then(
      (data) => {
        this.inFlight.delete(id);
        if (!this.disposed) this.add(id, data);
        this.notify();
      },
      (err: unknown) => {
        this.inFlight.delete(id);
        console.error('Terrain chunk failed', id, err);
        this.notify();
      },
    );
  }

  private notify(): void {
    const waiting = this.arrivals;
    this.arrivals = [];
    for (const r of waiting) r();
  }

  private add(id: string, d: ChunkData): void {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(d.positions, 3));
    g.setAttribute('normal', new BufferAttribute(d.normals, 3, true));
    g.setAttribute('landClass', new BufferAttribute(d.landClass, 4, true));
    g.setAttribute('landExtra', new BufferAttribute(d.landExtra, 4, true));
    g.setIndex(new BufferAttribute(this.indices, 1));
    const half = chunkSizeM(this.map.terrain, d.level) / 2;
    const midY = (d.minY + d.maxY) / 2;
    g.boundingSphere = new Sphere(new Vector3(0, midY, 0), Math.hypot(half, half, (d.maxY - d.minY) / 2 + skirtDepthM(d.level)));
    const mesh = new Mesh(g, this.material);
    mesh.name = `terrain-${id}`;
    mesh.position.set(d.centerX, 0, d.centerZ);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.visible = false;
    this.group.add(mesh);
    this.entries.set(id, { mesh, usedFrame: this.frame, minY: d.minY, maxY: d.maxY });
  }

  /** Drops the longest-unused hidden chunks beyond the cache size. */
  private evict(): void {
    if (this.entries.size <= MAX_MESHES) return;
    const hidden = [...this.entries].filter(([, e]) => !e.mesh.visible).sort((a, b) => a[1].usedFrame - b[1].usedFrame);
    for (const [id, e] of hidden.slice(0, this.entries.size - MAX_MESHES)) {
      this.group.remove(e.mesh);
      e.mesh.geometry.dispose();
      this.entries.delete(id);
    }
  }
}
