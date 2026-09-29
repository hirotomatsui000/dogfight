import { describe, expect, it } from 'vitest';
import { bboxSizeKm, squareBBox } from './geo-bbox.ts';

describe('squareBBox', () => {
  it.each([
    [50.81, 23.8, 9],
    [52.72, 16.25, 6],
    [49.2, 20.05, 7],
  ])('covers a square on the ground at %f N', (lat, lon, half) => {
    const box = squareBBox(lat, lon, half);
    const { widthKm, heightKm } = bboxSizeKm(box);
    expect(Math.abs(widthKm - 2 * half) / (2 * half)).toBeLessThan(0.01);
    expect(Math.abs(heightKm - 2 * half) / (2 * half)).toBeLessThan(0.01);
    expect((box.minLat + box.maxLat) / 2).toBeCloseTo(lat, 9);
    expect((box.minLon + box.maxLon) / 2).toBeCloseTo(lon, 9);
  });
  it('is wider in degrees of longitude than latitude away from the equator', () => {
    const box = squareBBox(50, 20, 10);
    expect(box.maxLon - box.minLon).toBeGreaterThan(box.maxLat - box.minLat);
  });
});
