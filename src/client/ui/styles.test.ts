import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('styles.css', () => {
  it('keeps [hidden] overlays hidden even though .overlay sets display', () => {
    // Regression: `.overlay { display: grid }` overrode the UA `[hidden] { display: none }`,
    // so the pause menu was visible (and blank) from the first frame.
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });

  it("lets Free Flight's map take clicks although the map overlay lets them through", () => {
    // Regression: `.map-screen { pointer-events: none }` reached the map canvas too, so clicking the map to fly from
    // there (M5) went to the game view underneath.
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.map-screen\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\.map-screen canvas\.pickable\s*\{[^}]*pointer-events:\s*auto/);
  });

  it('styles every class the client code puts on an element', () => {
    // Regression: dropping the title screen's "Clock runs" (revision 19) also dropped `.world-clock`, which Free
    // Flight's pause panel still used for its check boxes.
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    const styled = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    // Hooks for scripts and tests, laid out by their parents' rules.
    const hooks = new Set(['brand', 'mission-name', 'pick-world', 'setting-name']);
    const root = new URL('../', import.meta.url);
    const unstyled: string[] = [];
    for (const file of readdirSync(root, { recursive: true }) as string[]) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
      const src = readFileSync(new URL(file, root), 'utf8');
      const lists = [
        ...src.matchAll(/\bel\(\s*'[\w-]+'\s*,\s*'([^']+)'/g),
        ...src.matchAll(/className\s*=\s*'([^']+)'/g),
        ...src.matchAll(/classList\.(?:add|toggle)\(\s*'([^']+)'/g),
      ];
      for (const m of lists) for (const c of m[1].split(/\s+/)) if (!styled.has(c) && !hooks.has(c)) unstyled.push(`${c} (${file})`);
    }
    expect(unstyled).toEqual([]);
  });
});
