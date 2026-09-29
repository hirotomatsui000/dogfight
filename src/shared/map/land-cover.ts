export type LandCover = 'sea' | 'lake' | 'river' | 'beach' | 'field' | 'meadow' | 'forest' | 'rock' | 'snow';

export const WATER_COVERS: ReadonlySet<LandCover> = new Set<LandCover>(['sea', 'lake', 'river']);
