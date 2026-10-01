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
