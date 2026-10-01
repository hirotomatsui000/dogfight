import { Box3, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { kestrel } from '../../shared/data/aircraft/kestrel.ts';
import { getAircraft, listAircraft } from '../../shared/data/aircraft/registry.ts';
import { buildAircraftModel, fuselageSections, parametricModel } from './aircraft-model.ts';

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

describe('generated models for the whole roster (M3)', () => {
  it.each(listAircraft().map((c) => [c.id, c] as const))('builds %s at its size, with no broken vertices', (_id, c) => {
    const model = buildAircraftModel(c.visual, { id: c.id, team: c.team, twoSeat: c.sensors.twoSeat });
    const box = new Box3().setFromObject(model.root);
    const size = box.getSize(new Vector3());
    expect(size.z).toBeGreaterThan(c.visual.lengthM * 0.95);
    expect(size.z).toBeLessThan(c.visual.lengthM * 1.2);
    expect(size.x).toBeGreaterThan(c.visual.spanM * 0.95);
    expect(size.x).toBeLessThan(c.visual.spanM * 1.1);
    expect(model.nozzles).toHaveLength(c.visual.engines);
    model.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count * 3; i++) expect(Number.isFinite(p.array[i])).toBe(true);
    });
    for (const name of ['fuselage', 'wings', 'stabilators', 'canopy', 'intakes', 'fin-flash']) expect(model.root.getObjectByName(name), name).toBeDefined();
  });

  it('gives the two-seater a longer canopy and the LERX jets their strakes', () => {
    const canopyLength = (id: string) => {
      const c = getAircraft(id);
      const canopy = buildAircraftModel(c.visual, { twoSeat: c.sensors.twoSeat }).root.getObjectByName('canopy');
      return canopy ? new Box3().setFromObject(canopy).getSize(new Vector3()).z / c.visual.lengthM : 0;
    };
    expect(canopyLength('sapsan')).toBeGreaterThan(canopyLength('yastreb') * 1.4);
    expect(buildAircraftModel(getAircraft('yastreb').visual).root.getObjectByName('lerx')).toBeDefined();
    expect(buildAircraftModel(getAircraft('condor').visual).root.getObjectByName('lerx')).toBeUndefined();
  });

  it('copies a cached model per aircraft, sharing geometry but with its own flames', () => {
    const a = parametricModel(getAircraft('condor'));
    const b = parametricModel(getAircraft('condor'));
    expect(a.root).not.toBe(b.root);
    expect(a.afterburners).toHaveLength(2);
    expect(a.afterburners[0]).not.toBe(b.afterburners[0]);
    const fa = a.root.getObjectByName('fuselage') as Mesh;
    const fb = b.root.getObjectByName('fuselage') as Mesh;
    expect(fa.geometry).toBe(fb.geometry);
  });
});

describe('fuselage sections', () => {
  it('runs from a pointed nose to the tail, widest over the wing', () => {
    const v = getAircraft('kestrel').visual;
    const s = fuselageSections(v);
    expect(s[0].z).toBeCloseTo(-v.lengthM / 2, 6);
    expect(s.at(-1)?.z).toBeCloseTo(v.lengthM / 2, 6);
    expect(s[0].w).toBeLessThan(0.05);
    for (let i = 1; i < s.length; i++) expect(s[i].z).toBeGreaterThan(s[i - 1].z);
    const widest = s.reduce((a, b) => (b.w > a.w ? b : a));
    expect(widest.z).toBeGreaterThan(-v.lengthM * 0.2);
  });
});
