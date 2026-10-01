export type LandCover =
  | 'sea'
  | 'lake'
  | 'river'
  | 'beach'
  | 'field'
  | 'meadow'
  | 'forest'
  | 'rock'
  | 'snow'
  | 'marsh'
  | 'urban'
  | 'airfield';

/** Every land cover, in the order of its byte code in land-cover grids (Lechovia, M4). */
export const LAND_COVERS: readonly LandCover[] = ['sea', 'lake', 'river', 'beach', 'field', 'meadow', 'forest', 'rock', 'snow', 'marsh', 'urban', 'airfield'];

export const COVER_CODE: Readonly<Record<LandCover, number>> = Object.fromEntries(LAND_COVERS.map((c, i) => [c, i])) as Record<LandCover, number>;

export const WATER_COVERS: ReadonlySet<LandCover> = new Set<LandCover>(['sea', 'lake', 'river']);
