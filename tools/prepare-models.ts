/**
 * Prepares the owner's aircraft models (generated with Tripo) for the game. Each model is turned into the game's
 * body frame (nose toward -z, y up, centred on its bounding box, exactly 1 long), simplified to about 25,000
 * triangles, given 1024 px WebP textures and meshopt-compressed geometry. That takes the files from about 11 MB to
 * about 0.4 MB each.
 *
 * The results in src/client/assets/models/ are committed, so normal builds never need this script. The originals are
 * not committed: put them in models-src/ (ignored by git) or pass their folder.
 *
 * Run: node tools/prepare-models.ts [folder with the original .glb files]
 */
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { type Document, getBounds, type mat4, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

interface ModelSource {
  file: string;
  /** turn about +y that brings the nose to -z */
  yawDeg: number;
  /** then a turn about +z that levels the wings */
  rollDeg: number;
}

/**
 * Keyed by aircraft id. The Su-57 model came out yawed and banked; its angles are the ones that make it
 * mirror-symmetric about the x = 0 plane (a search over area-weighted surface samples, 2026-10-01).
 */
const MODELS: Record<string, ModelSource> = {
  kestrel: { file: 'US_Air_Force_F35A.glb', yawDeg: 180, rollDeg: 0 },
  kobchik: { file: 'Russia_Air_Force_Su-57.glb', yawDeg: -81, rollDeg: -7 },
};

/** Share of vertices the simplifier keeps (about 25,000 of 200,000+ triangles). */
const KEEP_RATIO = 0.12;
const SIMPLIFY_ERROR = 0.0005;
const TEXTURE_PX = 1024;
const WEBP_QUALITY = 82;

const source = process.argv[2] ?? join(process.cwd(), 'models-src');
const out = join(process.cwd(), 'src/client/assets/models');

/** Column-major 4×4 matrix of a turn by `yaw` about +y followed by `roll` about +z. */
function bodyFrame(yawDeg: number, rollDeg: number): mat4 {
  const y = (yawDeg * Math.PI) / 180;
  const r = (rollDeg * Math.PI) / 180;
  const cy = Math.cos(y), sy = Math.sin(y), cr = Math.cos(r), sr = Math.sin(r);
  // Rz(r) · Ry(y)
  return [cr * cy, sr * cy, -sy, 0, -sr, cr, 0, 0, cr * sy, sr * sy, cy, 0, 0, 0, 0, 1];
}

/** Column-major matrix that moves the bounding-box centre to the origin and scales the length (z) to 1. */
function unitLength(doc: Document): mat4 {
  const b = getBounds(doc.getRoot().listScenes()[0]);
  const s = 1 / (b.max[2] - b.min[2]);
  const c = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
  return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, -c[0] * s, -c[1] * s, -c[2] * s, 1];
}

async function prepare(id: string, m: ModelSource, io: NodeIO): Promise<void> {
  const doc = await io.read(join(source, m.file));
  const root = doc.getRoot();
  // Tripo adds KHR_materials_volume (no visible effect without transmission) and FB_ngon_encoding (editor-only).
  for (const ext of root.listExtensionsUsed()) ext.dispose();
  for (const mesh of root.listMeshes()) transformMesh(mesh, bodyFrame(m.yawDeg, m.rollDeg));
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: KEEP_RATIO, error: SIMPLIFY_ERROR }));
  const fit = unitLength(doc);
  for (const mesh of root.listMeshes()) transformMesh(mesh, fit);
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_PX, TEXTURE_PX], quality: WEBP_QUALITY }),
    prune(),
    dedup(),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const target = join(out, `${id}.glb`);
  await io.write(target, doc);
  let triangles = 0;
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) triangles += (p.getIndices()?.getCount() ?? 0) / 3;
  console.log(`${target}: ${triangles} triangles, ${(statSync(target).size / 1024).toFixed(0)} kB`);
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const [id, m] of Object.entries(MODELS)) await prepare(id, m, io);
