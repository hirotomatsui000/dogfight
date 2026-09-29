export interface RgbImage {
  width: number;
  height: number;
  /** RGB bytes, rows top-down */
  data: Uint8Array;
}

/** Decodes an uncompressed 24- or 32-bit BMP (what macOS `sips -s format bmp` writes) into top-down RGB. */
export function decodeBmp(buf: Uint8Array): RgbImage {
  if (buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) throw new Error('Not a BMP file');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dataOffset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bpp = view.getUint16(28, true);
  if (bpp !== 24 && bpp !== 32) throw new Error(`Unsupported BMP bit depth: ${bpp}`);
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const bytesPerPixel = bpp / 8;
  const stride = Math.ceil((bpp * width) / 32) * 4;
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const fileRow = bottomUp ? height - 1 - y : y;
    for (let x = 0; x < width; x++) {
      const o = dataOffset + fileRow * stride + x * bytesPerPixel;
      const t = (y * width + x) * 3;
      data[t] = buf[o + 2];
      data[t + 1] = buf[o + 1];
      data[t + 2] = buf[o];
    }
  }
  return { width, height, data };
}
