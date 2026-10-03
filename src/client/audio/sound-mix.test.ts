import { describe, expect, it } from 'vitest';
import { beepOn, explosionGain, missileTone, seekerTone, windMix } from './sound-mix.ts';

describe('sound mix', () => {
  it('gets windier with speed and goes quiet when dead (no engine sound since revision 19)', () => {
    expect(windMix(400, true).windGain).toBeGreaterThan(windMix(100, true).windGain);
    expect(windMix(400, true).windHz).toBeGreaterThan(windMix(100, true).windHz);
    expect(windMix(300, false).windGain).toBe(0);
  });

  it('growls while tracking and holds a tone when locked', () => {
    expect(seekerTone('search')).toBe('none');
    expect(seekerTone('track')).toBe('growl');
    expect(seekerTone('locked')).toBe('lock');
    expect(seekerTone('off')).toBe('none');
    expect(missileTone('off', 'tracking')).toBe('radar-track');
    expect(missileTone('off', 'locked')).toBe('radar-lock');
    expect(missileTone('track', 'off')).toBe('growl');
    expect(missileTone('off', 'search')).toBe('none');
  });

  it('fades explosions with distance and beeps on a duty cycle', () => {
    expect(explosionGain(0)).toBe(1);
    expect(explosionGain(3000)).toBeCloseTo(0.25, 9);
    expect(explosionGain(9000)).toBe(0);
    expect(beepOn(0.05, 5)).toBe(true);
    expect(beepOn(0.15, 5)).toBe(false);
  });
});

describe('positional sound (M5)', () => {
  it('raises the pitch of an approaching source and lowers it once it has passed', async () => {
    const { dopplerFactor, nearestSources } = await import('./sound-mix.ts');
    const still = { x: 0, y: 0, z: 0 };
    // A jet 500 m north (−z) flying south toward us at 250 m/s.
    expect(dopplerFactor({ x: 0, y: 0, z: -500 }, { x: 0, y: 0, z: 250 }, still)).toBeGreaterThan(1.5);
    // The same jet past us, going away.
    expect(dopplerFactor({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 250 }, still)).toBeLessThan(0.7);
    expect(dopplerFactor({ x: 0, y: 0, z: -500 }, { x: 0, y: 0, z: 1000 }, still)).toBe(2);
    const near = nearestSources([{ id: 1, pos: { x: 900, y: 0, z: 0 } }, { id: 2, pos: { x: 100, y: 0, z: 0 } }, { id: 3, pos: { x: 5000, y: 0, z: 0 } }], still, 2, 2500);
    expect(near.map((s) => s.id)).toEqual([2, 1]);
  });
});
