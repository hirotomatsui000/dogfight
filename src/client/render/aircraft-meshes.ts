import { Group, type Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { AircraftConfig } from '../../shared/data/aircraft/types.ts';
import kestrelUrl from '../assets/models/kestrel.glb?url';
import kobchikUrl from '../assets/models/kobchik.glb?url';
import { addEngines, type AircraftModel, buildAircraftModel } from './aircraft-model.ts';
import type { LoadProgress } from './load-progress.ts';

/**
 * How an imported model sits in its jet. tools/prepare-models.ts writes every model 1 long with the nose toward -z,
 * so these numbers are fractions of the aircraft length.
 */
export interface ModelFit {
  url: string;
  /** nozzle exit centres, where the afterburner flames start */
  nozzles: readonly (readonly [x: number, y: number, z: number])[];
  nozzleRadius: number;
}

/** The owner's models (generated with Tripo; see CREDITS.md), keyed by aircraft id. */
export const IMPORTED_MODELS: Readonly<Record<string, ModelFit>> = {
  kestrel: { url: kestrelUrl, nozzles: [[0, -0.045, 0.31]], nozzleRadius: 0.035 },
  kobchik: {
    url: kobchikUrl,
    nozzles: [
      [-0.088, -0.06, 0.49],
      [0.098, -0.06, 0.49],
    ],
    nozzleRadius: 0.04,
  },
};

/** Loaded model scenes by aircraft id. An aircraft without one keeps the model generated from its data. */
export type AircraftMeshes = ReadonlyMap<string, Object3D>;

/** Never rejects: a model that fails to load is logged and left out, so its jet falls back to the generated model. */
export async function loadAircraftMeshes(
  fits: Readonly<Record<string, ModelFit>> = IMPORTED_MODELS,
  progress?: LoadProgress,
): Promise<AircraftMeshes> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const meshes = new Map<string, Object3D>();
  await Promise.all(
    Object.entries(fits).map(async ([id, fit]) => {
      try {
        const loading = loader.loadAsync(fit.url);
        meshes.set(id, (await (progress ? progress.track(loading) : loading)).scene);
      } catch (err) {
        console.error(`The ${id} model could not load; that jet uses the generated model.`, err);
      }
    }),
  );
  return meshes;
}

/** A copy of a loaded model at the jet's length, with nozzle exits and afterburners like the generated model's. */
export function buildImportedModel(template: Object3D, fit: ModelFit, lengthM: number): AircraftModel {
  const root = new Group();
  const body = template.clone();
  body.name = 'imported-body';
  body.scale.setScalar(lengthM);
  root.add(body);
  const exits = fit.nozzles.map(([x, y, z]) => new Vector3(x, y, z).multiplyScalar(lengthM));
  return { root, ...addEngines(root, exits, fit.nozzleRadius * lengthM) };
}

/** The imported model when one is loaded for this aircraft, otherwise the model generated from its data. */
export function aircraftModelFor(
  config: AircraftConfig,
  meshes: AircraftMeshes,
  fits: Readonly<Record<string, ModelFit>> = IMPORTED_MODELS,
): AircraftModel {
  const template = meshes.get(config.id);
  const fit = fits[config.id];
  return template && fit ? buildImportedModel(template, fit, config.visual.lengthM) : buildAircraftModel(config.visual);
}
