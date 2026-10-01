import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  type Scene,
  SRGBColorSpace,
  type Vector3,
} from 'three';
import { Rng } from '../../../shared/math/rng.ts';

const STAR_COUNT = 2600;
const SKY_RADIUS_M = 150000;
/** Drawn larger than the real moon (0.5°) so it reads at game resolutions. */
const MOON_ANGLE_RAD = (1.6 * Math.PI) / 180;

/** Craters and maria on a pale disc. */
function moonTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size * 0.45, size * 0.42, size * 0.1, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#f4f1e6');
  g.addColorStop(1, '#c9c4b4');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,118,110,0.35)';
  for (const [x, y, r] of [
    [0.38, 0.35, 0.14],
    [0.6, 0.45, 0.1],
    [0.5, 0.65, 0.12],
    [0.3, 0.6, 0.07],
  ]) {
    ctx.beginPath();
    ctx.arc(x * size, y * size, r * size, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Stars and the moon, drawn right after the sky and before everything else (so land and clouds cover them), fading in
 * as the sky darkens.
 */
export class NightSky {
  private readonly stars: Points;
  private readonly moon: Mesh;
  private readonly starMaterial: PointsMaterial;
  private readonly moonMaterial: MeshBasicMaterial;

  constructor(scene: Scene, pixelRatio: number) {
    const rng = new Rng(4242);
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform on the sphere.
      const y = rng.range(-0.2, 1);
      const a = rng.range(0, 2 * Math.PI);
      const h = Math.sqrt(1 - y * y);
      positions.set([Math.cos(a) * h * SKY_RADIUS_M, y * SKY_RADIUS_M, Math.sin(a) * h * SKY_RADIUS_M], i * 3);
      const b = Math.pow(rng.next(), 3) * 0.85 + 0.15;
      const warm = rng.next();
      colors.set([b * (0.85 + 0.15 * warm), b * 0.9, b * (1 - 0.15 * warm)], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.setAttribute('color', new BufferAttribute(colors, 3));
    this.starMaterial = new PointsMaterial({ size: 1.6 * pixelRatio, sizeAttenuation: false, vertexColors: true, blending: AdditiveBlending, depthWrite: false, fog: false, transparent: false, opacity: 0 });
    this.stars = new Points(g, this.starMaterial);
    this.stars.name = 'stars';
    this.stars.renderOrder = -1;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    const r = SKY_RADIUS_M * Math.tan(MOON_ANGLE_RAD / 2);
    this.moonMaterial = new MeshBasicMaterial({ map: moonTexture(), fog: false, depthWrite: false, transparent: true });
    this.moon = new Mesh(new CircleGeometry(r, 32), this.moonMaterial);
    this.moon.name = 'moon';
    this.moon.renderOrder = -1;
    this.moon.frustumCulled = false;
    scene.add(this.moon);
  }

  /** `night` 0 … 1; `moonDir` unit vector; `clear` 0 under an overcast deck … 1. */
  update(camera: Vector3, night: number, moonDir: Vector3, clear: number): void {
    this.stars.position.copy(camera);
    const starAlpha = night * clear;
    this.stars.visible = starAlpha > 0.01;
    // Transparent: false keeps them in the early, opaque pass; the colours fade instead.
    this.starMaterial.opacity = starAlpha;
    this.starMaterial.color.setScalar(starAlpha);
    this.moon.visible = moonDir.y > -0.05 && clear > 0.05;
    this.moon.position.copy(camera).addScaledVector(moonDir, SKY_RADIUS_M);
    this.moon.lookAt(camera);
    this.moonMaterial.opacity = clear * (0.25 + 0.75 * night);
  }

  dispose(): void {
    for (const o of [this.stars, this.moon]) {
      o.removeFromParent();
      o.geometry.dispose();
    }
    this.starMaterial.dispose();
    this.moonMaterial.map?.dispose();
    this.moonMaterial.dispose();
  }
}
