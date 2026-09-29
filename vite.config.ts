import { defineConfig } from 'vitest/config';

// `--mode single` inlines every imported asset (photos included) as a data URI so tools/build-single.ts
// can produce one self-contained HTML file.
const SINGLE_FILE_INLINE_LIMIT = 100_000_000;

export default defineConfig(({ mode }) => ({
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
