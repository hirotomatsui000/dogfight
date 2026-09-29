/**
 * One-time asset pipeline for the realistic scenery (see docs/superpowers/specs/2026-09-29-realistic-graphics-design.md).
 * Downloads the approved free-license sources into .asset-cache/, processes them with macOS `sips`, and writes the
 * results to src/client/assets/. The processed files are committed, so normal builds never need this script.
 *
 * Run: node tools/fetch-assets.ts
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeBmp } from './lib/bmp.ts';
import { type BBox, squareBBox } from './lib/geo-bbox.ts';
import { findSun, horizonColor } from './lib/sky-analysis.ts';

const root = process.cwd();
const cache = join(root, '.asset-cache');
const out = join(root, 'src/client/assets');
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });

const USER_AGENT = 'contested-skies-asset-fetch/1.0 (one-time download for a game prototype)';

const wmsUrl = (layer: string, b: BBox, size: number) =>
  'https://tiles.maps.eox.at/wms?service=WMS&version=1.1.1&request=GetMap&styles=&srs=EPSG:4326' +
  `&layers=${layer}&bbox=${[b.minLon, b.minLat, b.maxLon, b.maxLat].map((v) => v.toFixed(5)).join(',')}` +
  `&width=${size}&height=${size}&format=image/jpeg`;

const SATELLITE_LAYER = 's2cloudless-2017'; // CC BY 4.0 (2018+ editions are NC-SA: do not use)

const sources: { name: string; url: string }[] = [
  {
    name: 'sky-source.jpg',
    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/kloofendal_48d_partly_cloudy_puresky.jpg',
  },
  { name: 'sat-farmland.jpg', url: wmsUrl(SATELLITE_LAYER, squareBBox(50.8, 23.7, 9), 2048) },
  { name: 'sat-forest.jpg', url: wmsUrl(SATELLITE_LAYER, squareBBox(52.785, 16.25, 6), 2048) },
  { name: 'sat-mountain.jpg', url: wmsUrl(SATELLITE_LAYER, squareBBox(49.2, 20.05, 7), 2048) },
  { name: 'waternormals.jpg', url: 'https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/waternormals.jpg' },
  {
    name: 'detail-grass-rock.jpg',
    url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/aerial_grass_rock_diff_1k.jpg',
  },
];

async function download(url: string, target: string): Promise<void> {
  if (existsSync(target)) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`not a JPEG (${new TextDecoder().decode(bytes.slice(0, 120))})`);
      writeFileSync(`${target}.part`, bytes);
      renameSync(`${target}.part`, target);
      return;
    } catch (err) {
      if (attempt === 3) throw new Error(`Download failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

const sips = (...args: string[]) => execFileSync('sips', args, { stdio: 'pipe' });
const mb = (path: string) => `${(statSync(path).size / 1e6).toFixed(2)} MB`;

for (const s of sources) {
  await download(s.url, join(cache, s.name));
  console.log(`cached ${s.name} (${mb(join(cache, s.name))})`);
}

// Sky: 4096×2048 JPEG for the background and lighting.
sips('-Z', '4096', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', join(cache, 'sky-source.jpg'), '--out', join(out, 'sky.jpg'));

// Sun direction and haze color from a small copy of the sky.
const analysisBmp = join(cache, 'sky-analysis.bmp');
sips('-Z', '1024', '-s', 'format', 'bmp', join(out, 'sky.jpg'), '--out', analysisBmp);
const skyImage = decodeBmp(readFileSync(analysisBmp));
const sun = findSun(skyImage);
const meta = {
  source: 'Poly Haven: kloofendal_48d_partly_cloudy_puresky (CC0)',
  sunDirection: sun.direction.map((v) => Number(v.toFixed(4))),
  horizonColor: horizonColor(skyImage, sun),
};
writeFileSync(join(out, 'sky-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

for (const name of ['sat-farmland.jpg', 'sat-forest.jpg', 'sat-mountain.jpg', 'waternormals.jpg', 'detail-grass-rock.jpg']) {
  copyFileSync(join(cache, name), join(out, name));
}

for (const name of ['sky.jpg', 'sat-farmland.jpg', 'sat-forest.jpg', 'sat-mountain.jpg', 'waternormals.jpg', 'detail-grass-rock.jpg']) {
  console.log(`asset ${name}: ${mb(join(out, name))}`);
}
console.log('sky-meta.json:', JSON.stringify(meta));
