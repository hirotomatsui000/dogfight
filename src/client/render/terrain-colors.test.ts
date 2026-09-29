import { describe, expect, it } from 'vitest';
import { fieldVariation, terrainColor } from './terrain-colors.ts';

describe('terrain colors', () => {
  it('returns valid sRGB triples for every cover', () => {
    for (const cover of ['sea', 'lake', 'river', 'beach', 'field', 'meadow', 'forest', 'rock', 'snow'] as const) {
      for (const v of [0, 0.3, 0.99]) {
        const c = terrainColor(cover, v);
        for (const ch of c) expect(ch >= 0 && ch <= 255).toBe(true);
      }
    }
  });
  it('varies field colors by variation and keeps snow bright', () => {
    expect(terrainColor('field', 0.1)).not.toEqual(terrainColor('field', 0.9));
    expect(terrainColor('snow', 0.5)[0]).toBeGreaterThan(200);
  });
  it('keeps the variation constant inside one strip field and within [0, 1)', () => {
    expect(fieldVariation(10, 10)).toBe(fieldVariation(40, 30));
    for (let i = 0; i < 1000; i++) {
      const v = fieldVariation(i * 97.3, i * -41.9);
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});
