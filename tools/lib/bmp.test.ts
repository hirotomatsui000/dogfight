import { describe, expect, it } from 'vitest';
import { decodeBmp } from './bmp.ts';

/** Builds a minimal BMP (BITMAPINFOHEADER). `rows` are top-down lists of [r, g, b] pixels. */
function makeBmp(rows: number[][][], bpp: 24 | 32, topDown = false): Uint8Array {
  const width = rows[0].length;
  const height = rows.length;
  const stride = Math.ceil((bpp * width) / 32) * 4;
  const dataOffset = 54;
  const buf = new Uint8Array(dataOffset + stride * height);
  const view = new DataView(buf.buffer);
  buf[0] = 0x42;
  buf[1] = 0x4d;
  view.setUint32(2, buf.length, true);
  view.setUint32(10, dataOffset, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, topDown ? -height : height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, bpp, true);
  for (let y = 0; y < height; y++) {
    const fileRow = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rows[y][x];
      const o = dataOffset + fileRow * stride + x * (bpp / 8);
      buf[o] = b;
      buf[o + 1] = g;
      buf[o + 2] = r;
      if (bpp === 32) buf[o + 3] = 255;
    }
  }
  return buf;
}

const rows = [
  [[255, 0, 0], [0, 255, 0], [0, 0, 255]],
  [[10, 20, 30], [40, 50, 60], [70, 80, 90]],
];
const expected = [255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30, 40, 50, 60, 70, 80, 90];

describe('decodeBmp', () => {
  it('decodes bottom-up 24-bit BMPs with row padding into top-down RGB', () => {
    const img = decodeBmp(makeBmp(rows, 24));
    expect([img.width, img.height]).toEqual([3, 2]);
    expect(Array.from(img.data)).toEqual(expected);
  });
  it('decodes top-down BMPs', () => {
    expect(Array.from(decodeBmp(makeBmp(rows, 24, true)).data)).toEqual(expected);
  });
  it('decodes 32-bit BMPs', () => {
    expect(Array.from(decodeBmp(makeBmp(rows, 32)).data)).toEqual(expected);
  });
  it('rejects non-BMP data and unsupported bit depths', () => {
    expect(() => decodeBmp(new Uint8Array([1, 2, 3, 4]))).toThrow('Not a BMP file');
    const bad = makeBmp(rows, 24);
    new DataView(bad.buffer).setUint16(28, 8, true);
    expect(() => decodeBmp(bad)).toThrow('Unsupported BMP bit depth: 8');
  });
});
