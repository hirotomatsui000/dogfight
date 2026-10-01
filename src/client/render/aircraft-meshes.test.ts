import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { kestrel } from '../../shared/data/aircraft/kestrel.ts';
import { kobchik } from '../../shared/data/aircraft/kobchik.ts';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import { aircraftModelFor, buildImportedModel, IMPORTED_MODELS, type ModelFit } from './aircraft-meshes.ts';

/** A stand-in for a loaded model: a 1-long box, nose toward -z, like tools/prepare-models.ts writes. */
const template = () => new Mesh(new BoxGeometry(0.7, 0.2, 1), new MeshStandardMaterial());
const twinFit: ModelFit = { url: 'twin.glb', nozzles: [[-0.1, -0.05, 0.45], [0.1, -0.05, 0.45]], nozzleRadius: 0.04 };

describe('imported aircraft models', () => {
  it('scales the 1-long model to the aircraft length', () => {
    const body = buildImportedModel(template(), twinFit, kobchik.visual.lengthM).root.getObjectByName('imported-body');
    if (!body) throw new Error('no imported body');
    const size = new Box3().setFromObject(body).getSize(new Vector3());
    expect(size.z).toBeCloseTo(kobchik.visual.lengthM, 1);
    expect(size.x).toBeCloseTo(0.7 * kobchik.visual.lengthM, 1);
  });

  it('puts a nozzle exit with a hidden afterburner at each engine, in metres', () => {
    const model = buildImportedModel(template(), twinFit, 20);
    expect(model.nozzles).toHaveLength(2);
    expect(model.afterburners).toHaveLength(2);
    expect(model.nozzles[1].position.toArray()).toEqual([2, -1, 9]);
    expect(model.afterburners.every((f) => !f.visible)).toBe(true);
  });

  it('uses the loaded model for its aircraft and the generated model for the rest', () => {
    const meshes = new Map([['kobchik', template()]]);
    const fits = { kobchik: twinFit };
    const imported = aircraftModelFor(kobchik, meshes, fits).root;
    expect(imported.getObjectByName('imported-body')).toBeDefined();
    expect(imported.getObjectByName('fuselage')).toBeUndefined();
    expect(aircraftModelFor(kestrel, meshes, fits).root.getObjectByName('fuselage')).toBeDefined();
    expect(aircraftModelFor(kobchik, new Map(), fits).root.getObjectByName('fuselage')).toBeDefined();
  });

  it('fits each bundled model to a known aircraft, with its nozzles at the back', () => {
    for (const [id, fit] of Object.entries(IMPORTED_MODELS)) {
      expect(getAircraft(id).id).toBe(id);
      expect(fit.nozzles).toHaveLength(getAircraft(id).visual.engines);
      for (const [x, y, z] of fit.nozzles) {
        expect(Math.abs(x)).toBeLessThan(0.25);
        expect(Math.abs(y)).toBeLessThan(0.15);
        expect(z).toBeGreaterThan(0.2);
        expect(z).toBeLessThanOrEqual(0.5);
      }
    }
  });
});
