import {
  CanvasTexture,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FogExp2,
  PMREMGenerator,
  type Scene,
  SRGBColorSpace,
  type Texture,
  Vector3,
  type WebGLRenderer,
} from 'three';
import skyMeta from '../assets/sky-meta.json';

const GROUND_BOUNCE_COLOR = '#46503c';
const SUN_INTENSITY = 2.6;
/** Exponential haze: ~7% at 10 km, 50% at 30 km, ~94% at 60 km, so the map edge fades into the photo's horizon. */
const HAZE_DENSITY = 2.8e-5;

/**
 * Photographed sky (Poly Haven, CC0) as the background and as image-based lighting. The sun light and the haze
 * color come from sky-meta.json, which tools/fetch-assets.ts derived from the same photo.
 */
export class SkySystem {
  readonly sunDirection = new Vector3();

  constructor(scene: Scene, renderer: WebGLRenderer, sky: Texture) {
    sky.mapping = EquirectangularReflectionMapping;
    sky.colorSpace = SRGBColorSpace;
    scene.background = sky;

    const environmentSource = groundLitEnvironment(sky.image as CanvasImageSource, skyMeta.horizonColor);
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(environmentSource).texture;
    environmentSource.dispose();
    pmrem.dispose();

    this.sunDirection.fromArray(skyMeta.sunDirection).normalize();
    const sun = new DirectionalLight(0xfff2e0, SUN_INTENSITY);
    sun.position.copy(this.sunDirection).multiplyScalar(1000);
    scene.add(sun);
    scene.fog = new FogExp2(new Color(skyMeta.horizonColor), HAZE_DENSITY);
  }
}

/**
 * The "pure sky" photo mirrors the sky below the horizon. For lighting, replace that lower half with a ground
 * color so aircraft bellies get a realistic, darker ground bounce instead of blue sky light.
 */
function groundLitEnvironment(image: CanvasImageSource, horizonColor: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available in this browser');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const horizonY = canvas.height / 2;
  const gradient = ctx.createLinearGradient(0, horizonY, 0, horizonY + 64);
  gradient.addColorStop(0, horizonColor);
  gradient.addColorStop(1, GROUND_BOUNCE_COLOR);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, horizonY, canvas.width, 64);
  ctx.fillStyle = GROUND_BOUNCE_COLOR;
  ctx.fillRect(0, horizonY + 64, canvas.width, canvas.height - horizonY - 64);
  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
