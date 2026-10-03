import { defineConfig } from 'vitest/config';

/**
 * Social sites need an absolute URL for the preview image. Set SITE_URL (for example
 * https://hirotomatsui000.github.io/lechovia-skies/) when building for a known address; without it the links stay relative
 * to the page.
 */
function siteUrl(): string {
  const url = process.env.SITE_URL ?? '';
  return url === '' || url.endsWith('/') ? url : `${url}/`;
}

// `--mode single` inlines every imported asset (photos included) as a data URI so tools/build-single.ts
// can produce one self-contained HTML file.
const SINGLE_FILE_INLINE_LIMIT = 100_000_000;

export default defineConfig(({ mode }) => ({
  // Relative asset paths: the site works from any folder, such as GitHub Pages' /lechovia-skies/.
  base: './',
  plugins: [{ name: 'site-url', transformIndexHtml: (html: string) => html.replaceAll('__SITE_URL__', siteUrl()) }],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: mode === 'single' ? 20000 : 1500,
    assetsInlineLimit: mode === 'single' ? SINGLE_FILE_INLINE_LIMIT : 4096,
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
}));
