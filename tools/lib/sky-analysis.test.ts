import { describe, expect, it } from 'vitest';
import type { RgbImage } from './bmp.ts';
import { equirectPixelToDirection, findSun, horizonColor } from './sky-analysis.ts';

const solid = (width: number, height: number, rgb: [number, number, number]): RgbImage => {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) data.set(rgb, i * 3);
  return { width, height, data };
};
const paint = (img: RgbImage, x: number, y: number, rgb: [number, number, number]) =>
  img.data.set(rgb, (y * img.width + x) * 3);

describe('equirectPixelToDirection (three.js equirectUv convention)', () => {
  const W = 400;
  const H = 200;
  it('maps the image center column to +x and three-quarters across to +z', () => {
    const [x, y, z] = equirectPixelToDirection(W / 2 - 0.5, H / 2 - 0.5, W, H);
    expect([x, y, z].map((v) => Math.round(v * 1000) / 1000)).toEqual([1, 0, 0]);
    const d = equirectPixelToDirection(W * 0.75 - 0.5, H / 2 - 0.5, W, H);
    expect(d[2]).toBeCloseTo(1, 6);
  });
  it('maps the top row to straight up and the bottom row to straight down', () => {
    expect(equirectPixelToDirection(10, 0, W, H)[1]).toBeGreaterThan(0.999);
    expect(equirectPixelToDirection(10, H - 1, W, H)[1]).toBeLessThan(-0.999);
  });
  it('returns unit vectors', () => {
    const [x, y, z] = equirectPixelToDirection(123, 45, W, H);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
  });
});

describe('findSun', () => {
  it('finds the centre of the brightest spot', () => {
    const img = solid(200, 100, [80, 120, 200]);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) paint(img, 150 + dx, 30 + dy, [255, 255, 250]);
    paint(img, 20, 90, [250, 250, 250]); // a lone hot pixel elsewhere must not win over the larger spot
    const sun = findSun(img);
    expect(sun.px).toBeCloseTo(150, 0);
    expect(sun.py).toBeCloseTo(30, 0);
    expect(sun.direction).toEqual(equirectPixelToDirection(sun.px, sun.py, 200, 100));
  });
});

describe('horizonColor', () => {
  it('samples right at the horizon (0.5°–2.5°), not the cloud band higher up', () => {
    // 1 px per degree: rows 87-89 are 2.5°-0.5° above the horizon; rows 84-86 (3.5°-5.5°) hold darker clouds.
    const img = solid(360, 180, [40, 60, 90]);
    for (let y = 87; y < 90; y++) for (let x = 0; x < 360; x++) paint(img, x, y, [200, 210, 225]);
    expect(horizonColor(img, { px: 0, py: 0 })).toBe('#c8d2e1');
  });
  it('averages the band just above the horizon, ignoring the area around the sun', () => {
    const img = solid(360, 180, [100, 150, 200]);
    for (let y = 0; y < 180; y++) for (let x = 0; x < 360; x++) if (y >= 90) paint(img, x, y, [0, 0, 0]);
    for (let y = 80; y < 90; y++) for (let x = 170; x < 190; x++) paint(img, x, y, [255, 255, 255]);
    expect(horizonColor(img, { px: 180, py: 85 })).toBe('#6496c8');
  });
});
