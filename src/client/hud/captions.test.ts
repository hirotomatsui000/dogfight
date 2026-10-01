import { describe, expect, it } from 'vitest';
import { seekerTone } from '../audio/sound-mix.ts';
import { WARNING_CAPTIONS } from './captions.ts';
import { seekerLabel } from './combat-layer.ts';

describe('warning captions', () => {
  it('shows the seeker tone as the weapons-status text the HUD draws', () => {
    for (const mode of ['track', 'locked'] as const) {
      const tone = seekerTone(mode);
      if (tone === 'none') throw new Error(`${mode} should sound`);
      expect(WARNING_CAPTIONS[tone]).toBe(`SRM ${seekerLabel(mode)}`);
    }
  });

  it('has text for every warning sound', () => {
    for (const text of Object.values(WARNING_CAPTIONS)) expect(text.length).toBeGreaterThan(0);
    expect(Object.keys(WARNING_CAPTIONS).sort()).toEqual(['growl', 'hit-taken', 'lock', 'missile-warning']);
  });
});
