import type { LandCover } from '../../shared/map/land-cover.ts';

export type RGB255 = [number, number, number];

const FIELD_PALETTE: readonly RGB255[] = [
  [196, 178, 106],
  [112, 142, 64],
  [134, 106, 76],
  [178, 170, 82],
  [150, 160, 90],
];

const COVER_COLORS: Record<Exclude<LandCover, 'field'>, RGB255> = {
  sea: [30, 68, 94],
  lake: [44, 80, 96],
  river: [48, 84, 98],
  beach: [206, 192, 152],
  meadow: [104, 138, 70],
  forest: [44, 70, 38],
  rock: [120, 114, 106],
  snow: [236, 240, 246],
};

/** sRGB (0-255) color for a land cover; `variation` (0..1) picks field crops and adds subtle brightness jitter. */
export function terrainColor(cover: LandCover, variation: number, out: RGB255 = [0, 0, 0]): RGB255 {
  const v = Math.min(Math.max(variation, 0), 0.999999);
  const base = cover === 'field' ? FIELD_PALETTE[Math.floor(v * FIELD_PALETTE.length)] : COVER_COLORS[cover];
  const jitter = cover === 'snow' || cover === 'sea' ? 1 : 0.92 + 0.16 * ((v * 7.31) % 1);
  out[0] = Math.min(255, base[0] * jitter);
  out[1] = Math.min(255, base[1] * jitter);
  out[2] = Math.min(255, base[2] * jitter);
  return out;
}

const STRIP_WIDTH_M = 220;
const STRIP_LENGTH_M = 450;

/** Deterministic hash that is constant inside one strip field (long thin fields, as on the Polish plain). */
export function fieldVariation(x: number, z: number): number {
  const a = Math.floor(x / STRIP_LENGTH_M);
  const b = Math.floor(z / STRIP_WIDTH_M);
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
