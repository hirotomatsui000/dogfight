import { MirroredRepeatWrapping, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture, TextureLoader } from 'three';
import detailUrl from '../assets/detail-grass-rock.jpg';
import farmUrl from '../assets/sat-farmland.jpg';
import forestUrl from '../assets/sat-forest.jpg';
import mountainUrl from '../assets/sat-mountain.jpg';
import waterNormalsUrl from '../assets/waternormals.jpg';
import type { LoadProgress } from './load-progress.ts';

/** The photo textures of the realistic scenery (sources and licenses: CREDITS.md). */
export interface SceneryTextures {
  farm: Texture;
  forest: Texture;
  mountain: Texture;
  detail: Texture;
  waterNormals: Texture;
}

/** three.js lowers this to what the graphics card supports, so loading needs no renderer. */
const ANISOTROPY = 8;

export async function loadSceneryTextures(progress?: LoadProgress): Promise<SceneryTextures> {
  const loader = new TextureLoader();
  const load = (url: string) => (progress ? progress.track(loader.loadAsync(url)) : loader.loadAsync(url));
  const [farm, forest, mountain, detail, waterNormals] = await Promise.all([farmUrl, forestUrl, mountainUrl, detailUrl, waterNormalsUrl].map(load));
  // Real photos are not seamless: mirrored tiling hides the edges.
  for (const photo of [farm, forest, mountain]) {
    photo.colorSpace = SRGBColorSpace;
    photo.wrapS = MirroredRepeatWrapping;
    photo.wrapT = MirroredRepeatWrapping;
    photo.anisotropy = ANISOTROPY;
  }
  detail.colorSpace = SRGBColorSpace;
  detail.wrapS = RepeatWrapping;
  detail.wrapT = RepeatWrapping;
  detail.anisotropy = ANISOTROPY;
  waterNormals.colorSpace = NoColorSpace;
  waterNormals.wrapS = RepeatWrapping;
  waterNormals.wrapT = RepeatWrapping;
  return { farm, forest, mountain, detail, waterNormals };
}

/** Sharper ground photos at grazing angles cost texture bandwidth: the graphics preset sets how much. */
export function setSceneryAnisotropy(textures: SceneryTextures, anisotropy: number): void {
  for (const t of [textures.farm, textures.forest, textures.mountain, textures.detail]) {
    if (t.anisotropy === anisotropy) continue;
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
  }
}
