import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Points, PointsMaterial, type Scene } from 'three';
import type { AircraftVisual } from '../../../shared/data/aircraft/types.ts';
import type { NightLights } from '../world/world-features.ts';

/**
 * Town, street and runway lights (spec §12.3): fixed-size points that glow after dusk. Seen from a distance the many
 * small lights merge into the shape of each town.
 */
export class GroundLights {
  private readonly points: Points[] = [];
  private readonly materials: PointsMaterial[] = [];

  constructor(scene: Scene, sets: readonly { lights: NightLights; sizePx: number }[], pixelRatio: number) {
    for (const { lights, sizePx } of sets) {
      if (lights.positions.length === 0) continue;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(lights.positions, 3));
      g.setAttribute('color', new BufferAttribute(lights.colors, 3));
      g.computeBoundingSphere();
      const material = new PointsMaterial({ size: sizePx * pixelRatio, sizeAttenuation: false, vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
      const p = new Points(g, material);
      p.name = 'night-lights';
      p.visible = false;
      scene.add(p);
      this.points.push(p);
      this.materials.push(material);
    }
  }

  /** `night` 0 (day) … 1 (night). */
  update(night: number): void {
    const on = Math.max(0, Math.min(1, (night - 0.15) / 0.5));
    for (const [i, p] of this.points.entries()) {
      p.visible = on > 0.01;
      this.materials[i].opacity = on;
    }
  }

  dispose(): void {
    for (const p of this.points) {
      p.removeFromParent();
      p.geometry.dispose();
    }
    for (const m of this.materials) m.dispose();
  }
}

/** Shared by every jet: steady red, green and white lights, and a white strobe that flashes. */
const navMaterial = new PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
const strobeMaterial = new PointsMaterial({ size: 6, sizeAttenuation: false, color: 0xffffff, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
const STROBE_PERIOD_S = 1.3;
const STROBE_ON_S = 0.07;

/**
 * Navigation lights for a jet model (spec §12.3): red on the left wingtip, green on the right, white on the tail, and
 * white strobes on both tips. Positions come from the jet's dimensions in its data file.
 */
export function navLights(v: AircraftVisual): Group {
  const tipZ = (v.wingPositionFraction - 0.5) * v.lengthM + 0.35 * v.wingRootChordM;
  const tipX = v.spanM * 0.49;
  const steady = new BufferGeometry();
  steady.setAttribute('position', new BufferAttribute(new Float32Array([-tipX, 0, tipZ, tipX, 0, tipZ, 0, v.tailHeightM * 0.15, v.lengthM * 0.48]), 3));
  steady.setAttribute('color', new BufferAttribute(new Float32Array([1, 0.12, 0.1, 0.15, 1, 0.3, 1, 1, 0.95]), 3));
  const strobes = new BufferGeometry();
  strobes.setAttribute('position', new BufferAttribute(new Float32Array([-tipX, 0, tipZ + 0.3, tipX, 0, tipZ + 0.3]), 3));
  const g = new Group();
  g.name = 'nav-lights';
  const a = new Points(steady, navMaterial);
  const b = new Points(strobes, strobeMaterial);
  a.frustumCulled = b.frustumCulled = false;
  g.add(a, b);
  return g;
}

/** Sets every jet's light brightness for the time of day; the strobe flashes on the clock. */
export function updateNavLights(night: number, timeS: number, pixelRatio: number): void {
  const on = Math.max(0, Math.min(1, (night - 0.05) / 0.4));
  navMaterial.opacity = on;
  navMaterial.size = 4 * pixelRatio;
  strobeMaterial.size = 6 * pixelRatio;
  strobeMaterial.opacity = on > 0 && timeS % STROBE_PERIOD_S < STROBE_ON_S ? on : 0;
}
