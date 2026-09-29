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

const MAX_ANISOTROPY = 8;

export async function loadSceneryTextures(maxAnisotropy: number): Promise<SceneryTextures> {
  const loader = new TextureLoader();
  const [sky, farm, forest, mountain, detail, waterNormals] = await Promise.all(
    [skyUrl, farmUrl, forestUrl, mountainUrl, detailUrl, waterNormalsUrl].map((url) => loader.loadAsync(url)),
  );
  const anisotropy = Math.min(MAX_ANISOTROPY, maxAnisotropy);
  sky.colorSpace = SRGBColorSpace;
  // Real photos are not seamless: mirrored tiling hides the edges.
  for (const photo of [farm, forest, mountain]) {
    photo.colorSpace = SRGBColorSpace;
    photo.wrapS = MirroredRepeatWrapping;
    photo.wrapT = MirroredRepeatWrapping;
    photo.anisotropy = anisotropy;
  }
  detail.colorSpace = SRGBColorSpace;
  detail.wrapS = RepeatWrapping;
  detail.wrapT = RepeatWrapping;
  detail.anisotropy = anisotropy;
  waterNormals.colorSpace = NoColorSpace;
  waterNormals.wrapS = RepeatWrapping;
  waterNormals.wrapT = RepeatWrapping;
  return { sky, farm, forest, mountain, detail, waterNormals };
}
