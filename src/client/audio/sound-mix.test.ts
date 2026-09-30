import { describe, expect, it } from 'vitest';
import { beepOn, engineMix, explosionGain, seekerTone } from './sound-mix.ts';

describe('sound mix', () => {
  it('raises engine pitch and volume with the throttle and adds afterburner roar above 90%', () => {
    const idle = engineMix(0, 150, true);
    const mil = engineMix(0.9, 150, true);
    const ab = engineMix(1, 150, true);
    expect(mil.engineHz).toBeGreaterThan(idle.engineHz);
    expect(mil.engineGain).toBeGreaterThan(idle.engineGain);
    expect(mil.afterburnerGain).toBe(0);
    expect(ab.afterburnerGain).toBeCloseTo(0.25, 9);
  });

  it('gets windier with speed and goes quiet when dead', () => {
    expect(engineMix(0.5, 400, true).windGain).toBeGreaterThan(engineMix(0.5, 100, true).windGain);
    const dead = engineMix(1, 300, false);
    expect(dead.engineGain + dead.afterburnerGain + dead.windGain).toBe(0);
  });

  it('growls while tracking and holds a tone when locked', () => {
    expect(seekerTone('search')).toBe('none');
    expect(seekerTone('track')).toBe('growl');
    expect(seekerTone('locked')).toBe('lock');
    expect(seekerTone('off')).toBe('none');
  });

  it('fades explosions with distance and beeps on a duty cycle', () => {
    expect(explosionGain(0)).toBe(1);
    expect(explosionGain(3000)).toBeCloseTo(0.25, 9);
    expect(explosionGain(9000)).toBe(0);
    expect(beepOn(0.05, 5)).toBe(true);
    expect(beepOn(0.15, 5)).toBe(false);
  });
});
