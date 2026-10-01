import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * Social sites need an absolute URL for the preview image. Set SITE_URL (for example https://example.netlify.app/)
 * when building for a known address; without it the links stay relative to the page.
 */
function siteUrl(): string {
  const url = process.env.SITE_URL ?? '';
  return url === '' || url.endsWith('/') ? url : `${url}/`;
}

// `--mode single` inlines every imported asset (photos included) as a data URI so tools/build-single.ts
// can produce one self-contained HTML file.
const SINGLE_FILE_INLINE_LIMIT = 100_000_000;

/** Pages and the game server compare build ids and ask players to reload after an update (spec §24). */
const VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;
const BUILD_ID = process.env.BUILD_ID ?? `${VERSION}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;

/** The game server for `npm run dev`: start it with `npm run server` and the dev page proxies to it. */
const GAME_SERVER = process.env.GAME_SERVER ?? 'localhost:8080';

export default defineConfig(({ mode, command }) => ({
  plugins: [
    { name: 'site-url', transformIndexHtml: (html: string) => html.replaceAll('__SITE_URL__', siteUrl()) },
    {
      name: 'build-id',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ build: BUILD_ID }) });
      },
    },
  ],
  define: { __BUILD_ID__: JSON.stringify(command === 'serve' ? 'dev' : BUILD_ID) },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: `ws://${GAME_SERVER}`, ws: true },
      '/api': { target: `http://${GAME_SERVER}` },
      '/healthz': { target: `http://${GAME_SERVER}` },
    },
  },
  build: {
    chunkSizeWarningLimit: mode === 'single' ? 20000 : 1500,
    assetsInlineLimit: mode === 'single' ? SINGLE_FILE_INLINE_LIMIT : 4096,
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
}));
