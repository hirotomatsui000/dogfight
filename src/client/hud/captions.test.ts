import { describe, expect, it } from 'vitest';
import { missileTone, seekerTone } from '../audio/sound-mix.ts';
import { WARNING_CAPTIONS } from './captions.ts';
import { seekerLabel } from './combat-layer.ts';
import { createRadarLock } from '../../shared/targeting/radar-lock.ts';
import { testView } from '../testing/views.ts';
import { weaponsLine } from './weapons-hud.ts';

describe('warning captions', () => {
  it('shows the seeker tone as the weapons-status text the HUD draws', () => {
    for (const mode of ['track', 'locked'] as const) {
      const tone = seekerTone(mode);
      if (tone === 'none') throw new Error(`${mode} should sound`);
      expect(WARNING_CAPTIONS[tone]).toBe(`SRM ${seekerLabel(mode)}`);
    }
  });

  it('shows the Lance radar-lock tone as the weapons-status text the HUD draws', () => {
    const radarLock = createRadarLock();
    const v = testView(1, { radarLock });
    for (const mode of ['tracking', 'locked'] as const) {
      radarLock.mode = mode;
      const tone = missileTone('off', mode);
      if (tone === 'none') throw new Error(`${mode} should sound`);
      expect(WARNING_CAPTIONS[tone]).toBe(weaponsLine(v, 'mrm').status.text);
    }
  });

  it('has text for every warning sound', () => {
    for (const text of Object.values(WARNING_CAPTIONS)) expect(text.length).toBeGreaterThan(0);
    expect(Object.keys(WARNING_CAPTIONS).sort()).toEqual(['growl', 'hit-taken', 'lock', 'missile-warning', 'radar-lock', 'radar-track', 'rwr-lock']);
  });
});
