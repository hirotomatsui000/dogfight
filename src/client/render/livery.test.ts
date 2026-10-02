import { describe, expect, it } from 'vitest';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import { camoPatches, liveryFor, liverySeed, liveryTextures } from './livery.ts';

describe('livery', () => {
  it('paints the USA in soft greys and Russia in blue-grey splinters, with team colours for markings', () => {
    const usa = liveryFor('usa', getAircraft('condor').visual);
    const russia = liveryFor('russia', getAircraft('yastreb').visual);
    expect(usa.scheme).toBe('ghost');
    expect(russia.scheme).toBe('splinter');
    expect(usa.team).not.toBe(russia.team);
    expect(usa.base).toBe(getAircraft('condor').visual.colors.primary);
  });

  it('draws the same seeded pattern for every jet of a type, and different ones per type', () => {
    expect(camoPatches('splinter', liverySeed('sapsan'), 10)).toEqual(camoPatches('splinter', liverySeed('sapsan'), 10));
    expect(camoPatches('splinter', liverySeed('sapsan'), 10)).not.toEqual(camoPatches('splinter', liverySeed('yastreb'), 10));
    for (const p of camoPatches('ghost', 7, 20)) {
      expect(p.points.length).toBe(10);
      for (const [x, y] of p.points) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    }
    expect(camoPatches('splinter', 7, 20).every((p) => p.points.length >= 4 && p.points.length <= 6)).toBe(true);
  });

  it('has no textures without a DOM, so tests never need a canvas', () => {
    expect(liveryTextures('kestrel', 'usa', getAircraft('kestrel').visual, [])).toBeNull();
  });
});
