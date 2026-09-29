import { describe, expect, it } from 'vitest';
import type { LandCover } from '../../shared/map/land-cover.ts';
import { landClassWeights } from './land-class.ts';

const ALL: LandCover[] = ['sea', 'lake', 'river', 'beach', 'field', 'meadow', 'forest', 'rock', 'snow'];

describe('landClassWeights', () => {
  it('maps land cover to the satellite land classes', () => {
    expect(landClassWeights('field')).toMatchObject({ farm: 1, forest: 0, mountain: 0 });
    expect(landClassWeights('meadow')).toMatchObject({ farm: 1 });
    expect(landClassWeights('forest')).toMatchObject({ forest: 1, farm: 0 });
    expect(landClassWeights('rock')).toMatchObject({ mountain: 1, snow: 0 });
    expect(landClassWeights('beach')).toMatchObject({ sand: 1 });
  });
  it('treats snow as mountain with a snow overlay', () => {
    expect(landClassWeights('snow')).toMatchObject({ mountain: 1, snow: 1 });
  });
  it('marks every kind of water as water', () => {
    for (const cover of ['sea', 'lake', 'river'] as const) expect(landClassWeights(cover).water).toBe(1);
  });
  it('always has base weights that sum to 1', () => {
    for (const cover of ALL) {
      const w = landClassWeights(cover);
      expect(w.farm + w.forest + w.mountain + w.sand + w.water).toBe(1);
    }
  });
});
