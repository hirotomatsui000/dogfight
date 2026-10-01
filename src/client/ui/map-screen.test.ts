import { describe, expect, it } from 'vitest';
import { LAND_COVERS } from '../../shared/map/land-cover.ts';
import { MAP_COLORS, mapToPixel, shadedColor } from './map-screen.ts';

describe('map screen (M4)', () => {
  it('puts the map centre in the middle of the image and north at the top', () => {
    expect(mapToPixel(0, 0, 200000, 1024)).toEqual({ u: 512, v: 512 });
    expect(mapToPixel(-100000, -100000, 200000, 1024)).toEqual({ u: 0, v: 0 });
    expect(mapToPixel(0, -50000, 200000, 1024).v).toBeLessThan(512);
  });

  it('has a colour for every land cover and shades land but not water', () => {
    for (const c of LAND_COVERS) expect(MAP_COLORS[c]).toHaveLength(3);
    expect(shadedColor('forest', 1.2)[1]).toBeGreaterThan(MAP_COLORS.forest[1]);
    expect(shadedColor('lake', 0.6)).toEqual([...MAP_COLORS.lake]);
    expect(Math.max(...shadedColor('snow', 2))).toBeLessThanOrEqual(255);
  });
});

describe('map screen picking (M5)', () => {
  it('turns a click into a map point and snaps it onto a nearby airfield', async () => {
    const { pickPoint, AIRFIELD_PICK_M } = await import('./map-screen.ts');
    const field = { id: 'x', name: 'Test Field', team: null, x: 20000, z: -10000, headingRad: 0, lengthM: 2500, widthM: 45, elevationM: 100 };
    const def = { sizeM: 100000, features: { settlements: [], roads: [], rivers: [], airfields: [field] } } as never;
    expect(pickPoint(def, 0.5, 0.5)).toEqual({ x: 0, z: 0, airfield: null });
    expect(pickPoint(def, 0.75, 0.25)).toEqual({ x: 25000, z: -25000, airfield: null });
    const near = pickPoint(def, 0.5 + (20000 + AIRFIELD_PICK_M / 2) / 100000, 0.5 - 0.1);
    expect(near).toEqual({ x: 20000, z: -10000, airfield: 'Test Field' });
  });
});
