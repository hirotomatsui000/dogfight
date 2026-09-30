import { MirroredRepeatWrapping, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture, TextureLoader } from 'three';
import detailUrl from '../assets/detail-grass-rock.jpg';
import farmUrl from '../assets/sat-farmland.jpg';
import forestUrl from '../assets/sat-forest.jpg';
import mountainUrl from '../assets/sat-mountain.jpg';
import skyUrl from '../assets/sky.jpg';
import waterNormalsUrl from '../assets/waternormals.jpg';

/** The photo textures of the realistic scenery (sources and licenses: CREDITS.md). */
export interface SceneryTextures {
  sky: Texture;
  farm: Texture;
  forest: Texture;
  mountain: Texture;
  detail: Texture;
  waterNormals: Texture;
}

/** three.js lowers this to what the graphics card supports, so loading needs no renderer. */
const ANISOTROPY = 8;

export async function loadSceneryTextures(): Promise<SceneryTextures> {
  const loader = new TextureLoader();
  const [sky, farm, forest, mountain, detail, waterNormals] = await Promise.all(
    [skyUrl, farmUrl, forestUrl, mountainUrl, detailUrl, waterNormalsUrl].map((url) => loader.loadAsync(url)),
  );
  sky.colorSpace = SRGBColorSpace;
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
  return { sky, farm, forest, mountain, detail, waterNormals };
}
