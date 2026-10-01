import type { LandCover } from '../../shared/map/land-cover.ts';

/**
 * How much of each satellite land-class photo a terrain vertex shows. `snow`, `urban` and `marsh` are overlays the
 * terrain shader paints on top of the photos.
 */
export interface LandClassWeights {
  farm: number;
  forest: number;
  mountain: number;
  sand: number;
  water: number;
  snow: number;
  urban: number;
  marsh: number;
}

const base = (): LandClassWeights => ({ farm: 0, forest: 0, mountain: 0, sand: 0, water: 0, snow: 0, urban: 0, marsh: 0 });

export function landClassWeights(cover: LandCover): LandClassWeights {
  const w = base();
  switch (cover) {
    case 'field':
    case 'meadow':
    case 'airfield':
      w.farm = 1;
      break;
    case 'urban':
      w.farm = 1;
      w.urban = 1;
      break;
    case 'marsh':
      w.farm = 0.6;
      w.forest = 0.4;
      w.marsh = 1;
      break;
    case 'forest':
      w.forest = 1;
      break;
    case 'rock':
      w.mountain = 1;
      break;
    case 'snow':
      w.mountain = 1;
      w.snow = 1;
      break;
    case 'beach':
      w.sand = 1;
      break;
    case 'sea':
    case 'lake':
    case 'river':
      w.water = 1;
      break;
  }
  return w;
}
