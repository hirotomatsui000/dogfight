import { describe, expect, it } from 'vitest';
import { isTouchOnly } from './device.ts';

const media = (matching: string[]) => (query: string) => ({ matches: matching.includes(query) });

describe('isTouchOnly', () => {
  it('is true for a phone or tablet with only a touchscreen', () => {
    expect(isTouchOnly(media(['(pointer: coarse)']))).toBe(true);
  });
  it('is false for a desktop or laptop', () => {
    expect(isTouchOnly(media(['(pointer: fine)', '(any-pointer: fine)']))).toBe(false);
  });
  it('is false for a touchscreen device that also has a mouse or trackpad', () => {
    expect(isTouchOnly(media(['(pointer: coarse)', '(any-pointer: fine)']))).toBe(false);
  });
});
