/**
 * Turns the Vite build in dist/ into one self-contained page: dist-single/index.html.
 * Run through `npm run build:single` (which builds first). Deploy by dropping dist-single/ on any static host.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { findExternalAssetRefs, inlineAssets } from './inline-assets.ts';

const root = process.cwd();
const distDir = join(root, 'dist');
const outDir = join(root, 'dist-single');

const readAsset = (href: string): string => {
  const path = normalize(join(distDir, href.replace(/^\.?\//, '')));
  if (!path.startsWith(distDir + sep)) throw new Error('asset path escapes dist/');
  return readFileSync(path, 'utf8');
};

const html = inlineAssets(readFileSync(join(distDir, 'index.html'), 'utf8'), readAsset);
const leftovers = findExternalAssetRefs(html);
if (leftovers.length > 0) {
  throw new Error(`Single-file build still references external assets (build with --mode single): ${leftovers.join(', ')}`);
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
console.log(`dist-single/index.html written (${Math.round(Buffer.byteLength(html) / 1024)} kB, no external assets)`);
