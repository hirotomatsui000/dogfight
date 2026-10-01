import type { Group, Object3D, Scene, Vector3 } from 'three';
import type { AircraftConfig } from '../../shared/data/aircraft/types.ts';
import { DEG } from '../../shared/math/units.ts';
import type { AircraftView } from '../session/game-session.ts';
import { type AircraftModel, parametricModel } from './aircraft-model.ts';
import { navLights } from './environment/night-lights.ts';
import { landingGear, setGear } from './landing-gear.ts';
import { ROTODOME_RAD_PER_S } from './sentinel-model.ts';
import { visibilityScale } from './visibility.ts';

interface Entry {
  model: AircraftModel;
  configId: string;
  gear: Group;
  /** a Sentinel's radar dish (M5) */
  dome: Object3D | null;
}

const AFTERBURNER_THRESHOLD = 0.9;
/** Other aircraft never look smaller than this (spec §15.4), so a jet 5 km out is a shape, not a pixel. */
const MIN_APPARENT_ANGLE = 0.7 * DEG;
const MAX_VISIBILITY_SCALE = 8;

/** Keeps one 3-D model per aircraft view in the scene. */
export class SceneSync {
  private readonly scene: Scene;
  private readonly build: (config: AircraftConfig) => AircraftModel;
  private readonly entries = new Map<number, Entry>();

  /** `build` makes each jet's model; by default the model generated from its data. */
  constructor(scene: Scene, build: (config: AircraftConfig) => AircraftModel = parametricModel) {
    this.scene = scene;
    this.build = build;
  }

  update(views: Iterable<AircraftView>, timeS: number, cameraPos: Vector3): void {
    const seen = new Set<number>();
    for (const v of views) {
      seen.add(v.id);
      let entry = this.entries.get(v.id);
      if (!entry || entry.configId !== v.config.id) {
        if (entry) this.scene.remove(entry.model.root);
        const model = this.build(v.config);
        const gear = landingGear(v.config.visual);
        model.root.add(navLights(v.config.visual), gear);
        entry = { model, configId: v.config.id, gear, dome: model.root.getObjectByName('rotodome') ?? null };
        this.entries.set(v.id, entry);
        this.scene.add(entry.model.root);
      }
      const root = entry.model.root;
      root.visible = v.alive;
      root.position.copy(v.position);
      root.quaternion.copy(v.quaternion);
      const scale = v.isLocal
        ? 1
        : visibilityScale(v.position.distanceTo(cameraPos), v.config.visual.lengthM, MIN_APPARENT_ANGLE, MAX_VISIBILITY_SCALE);
      root.scale.setScalar(scale);
      setGear(entry.gear, v.alive ? v.flight.gear : 0);
      if (entry.dome) entry.dome.rotation.y = (timeS * ROTODOME_RAD_PER_S) % (Math.PI * 2);

      const ab = (v.flight.throttle - AFTERBURNER_THRESHOLD) / (1 - AFTERBURNER_THRESHOLD);
      for (const [i, flame] of entry.model.afterburners.entries()) {
        flame.visible = ab > 0;
        if (ab > 0) {
          const flicker = 1 + 0.12 * Math.sin(timeS * 47 + i * 1.7) + 0.06 * Math.sin(timeS * 91);
          flame.scale.set(1, 1, (2 + 5 * ab) * flicker);
        }
      }
    }
    for (const [id, entry] of this.entries) {
      if (!seen.has(id)) {
        this.scene.remove(entry.model.root);
        this.entries.delete(id);
      }
    }
  }

  modelFor(id: number): AircraftModel | undefined {
    return this.entries.get(id)?.model;
  }

  dispose(): void {
    for (const entry of this.entries.values()) this.scene.remove(entry.model.root);
    this.entries.clear();
  }
}
