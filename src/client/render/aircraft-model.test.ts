import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { kestrel } from '../../shared/data/aircraft/kestrel.ts';
import { buildAircraftModel } from './aircraft-model.ts';

describe('buildAircraftModel', () => {
  it('builds a model with the configured dimensions', () => {
    const model = buildAircraftModel(kestrel.visual);
    const size = new Box3().setFromObject(model.root).getSize(new Vector3());
    expect(size.z).toBeGreaterThan(kestrel.visual.lengthM * 0.9);
    expect(size.z).toBeLessThan(kestrel.visual.lengthM * 1.2);
    expect(size.x).toBeGreaterThan(kestrel.visual.spanM * 0.9);
    expect(size.x).toBeLessThan(kestrel.visual.spanM * 1.1);
  });
  it('points the nose toward -z', () => {
    const box = new Box3().setFromObject(buildAircraftModel(kestrel.visual).root);
    expect(box.min.z).toBeLessThan(-kestrel.visual.lengthM * 0.45);
  });
  it('creates one nozzle and afterburner per engine and the configured tails', () => {
    const single = buildAircraftModel(kestrel.visual);
    expect(single.nozzles).toHaveLength(1);
    expect(single.afterburners).toHaveLength(1);
    expect(single.root.getObjectByName('tail-center')).toBeDefined();
    const twin = buildAircraftModel({ ...kestrel.visual, engines: 2, tail: 'twin-canted', canards: true });
    expect(twin.nozzles).toHaveLength(2);
    expect(twin.root.getObjectByName('tail-left')).toBeDefined();
    expect(twin.root.getObjectByName('tail-right')).toBeDefined();
    expect(twin.root.getObjectByName('canards')).toBeDefined();
  });
});
