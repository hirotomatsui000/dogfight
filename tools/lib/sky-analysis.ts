import type { RgbImage } from './bmp.ts';

export type Direction = [x: number, y: number, z: number];

/**
 * World direction seen at a pixel of an equirectangular sky, using three.js's equirectUv convention
 * (u = atan(z, x) / 2π + 0.5, v = asin(y) / π + 0.5, image top = v 1). `px`/`py` may be fractional.
 */
export function equirectPixelToDirection(px: number, py: number, width: number, height: number): Direction {
  const u = (px + 0.5) / width;
  const v = 1 - (py + 0.5) / height;
  const azimuth = (u - 0.5) * 2 * Math.PI;
  const elevation = (v - 0.5) * Math.PI;
  const c = Math.cos(elevation);
  return [c * Math.cos(azimuth), Math.sin(elevation), c * Math.sin(azimuth)];
}

const luminance = (img: RgbImage, i: number) =>
  0.2126 * img.data[i * 3] + 0.7152 * img.data[i * 3 + 1] + 0.0722 * img.data[i * 3 + 2];

/** Sun position: centroid of the brightest region after a 3×3 box blur (so single hot pixels can't win). */
export function findSun(img: RgbImage): { px: number; py: number; direction: Direction } {
  const { width, height } = img;
  const blurred = new Float32Array(width * height);
  let max = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = (x + dx + width) % width;
          sum += luminance(img, yy * width + xx);
          n++;
        }
      }
      const b = sum / n;
      blurred[y * width + x] = b;
      if (b > max) max = b;
    }
  }
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (let i = 0; i < blurred.length; i++) {
    if (blurred[i] >= max * 0.98) {
      sx += i % width;
      sy += Math.floor(i / width);
      count++;
    }
  }
  const px = sx / count;
  const py = sy / count;
  return { px, py, direction: equirectPixelToDirection(px, py, width, height) };
}

const toHex = (v: number) => Math.round(v).toString(16).padStart(2, '0');

/**
 * Average color of the sky 0.5°–2.5° above the horizon (the hazy horizon line itself), excluding everything within
 * 20° of the sun. Used as the distance-haze color so terrain fades into the photographed horizon.
 */
export function horizonColor(img: RgbImage, sun: { px: number; py: number }): string {
  const { width, height } = img;
  const [sx, sy, sz] = equirectPixelToDirection(sun.px, sun.py, width, height);
  const cosExclude = Math.cos((20 * Math.PI) / 180);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    const elevationDeg = 90 - ((y + 0.5) / height) * 180;
    if (elevationDeg < 0.5 || elevationDeg > 2.5) continue;
    for (let x = 0; x < width; x++) {
      const [dx, dy, dz] = equirectPixelToDirection(x, y, width, height);
      if (dx * sx + dy * sy + dz * sz > cosExclude) continue;
      const i = (y * width + x) * 3;
      r += img.data[i];
      g += img.data[i + 1];
      b += img.data[i + 2];
      n++;
    }
  }
  if (n === 0) throw new Error('No horizon pixels to sample');
  return `#${toHex(r / n)}${toHex(g / n)}${toHex(b / n)}`;
}
