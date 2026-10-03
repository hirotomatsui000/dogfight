import type { ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { afterburnerLevel, createAfterburner, plumeLengthM, setAfterburner, unshareAfterburner } from './afterburner.ts';

const uniforms = (flame: ReturnType<typeof createAfterburner>) => (flame.material as ShaderMaterial).uniforms;

describe('afterburner', () => {
  it('lights above 90% throttle and is full at 100%', () => {
    expect(afterburnerLevel(0.5)).toBe(0);
    expect(afterburnerLevel(0.9)).toBe(0);
    expect(afterburnerLevel(0.95)).toBeCloseTo(0.5);
    expect(afterburnerLevel(1)).toBe(1);
    expect(afterburnerLevel(1.2)).toBe(1);
  });

  it('makes a longer plume with more afterburner and from a bigger nozzle', () => {
    expect(plumeLengthM(0.5, 1)).toBeGreaterThan(plumeLengthM(0.5, 0.2));
    expect(plumeLengthM(0.6, 0.5)).toBeGreaterThan(plumeLengthM(0.4, 0.5));
    // Full afterburner from a 1 m nozzle: 7.5 diameters.
    expect(plumeLengthM(0.5, 1)).toBeCloseTo(7.5);
  });

  it('starts hidden, lights with the level and goes out at 0', () => {
    const flame = createAfterburner(0.5);
    expect(flame.visible).toBe(false);
    setAfterburner(flame, 0.3, 0);
    expect(flame.visible).toBe(true);
    const short = flame.scale.z;
    setAfterburner(flame, 1, 0);
    expect(flame.scale.z).toBeGreaterThan(short);
    expect(uniforms(flame).uLevel.value).toBe(1);
    expect(uniforms(flame).uLengthM.value).toBe(flame.scale.z);
    setAfterburner(flame, 0, 0);
    expect(flame.visible).toBe(false);
  });

  it('flickers: the plume length changes a little over time', () => {
    const flame = createAfterburner(0.5);
    const lengths = [0, 0.05, 0.1, 0.15].map((t) => {
      setAfterburner(flame, 1, t);
      return flame.scale.z;
    });
    expect(new Set(lengths).size).toBeGreaterThan(1);
    for (const l of lengths) expect(Math.abs(l / plumeLengthM(0.5, 1) - 1)).toBeLessThan(0.1);
  });

  it('gives a copied flame its own material, so two jets burn at their own levels', () => {
    const a = createAfterburner(0.5);
    const b = a.clone();
    expect(b.material).toBe(a.material);
    unshareAfterburner(b);
    expect(b.material).not.toBe(a.material);
    expect(uniforms(b).uSeed.value).not.toBe(uniforms(a).uSeed.value);
    setAfterburner(a, 1, 0);
    setAfterburner(b, 0.2, 0);
    expect(uniforms(a).uLevel.value).toBe(1);
    expect(uniforms(b).uLevel.value).toBe(0.2);
  });
});
