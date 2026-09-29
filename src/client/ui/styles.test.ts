import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('styles.css', () => {
  it('keeps [hidden] overlays hidden even though .overlay sets display', () => {
    // Regression: `.overlay { display: grid }` overrode the UA `[hidden] { display: none }`,
    // so the pause menu was visible (and blank) from the first frame.
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });
});
