import type { Scene } from 'three';
import type { AircraftView } from '../session/game-session.ts';
import { type AircraftModel, buildAircraftModel } from './aircraft-model.ts';

interface Entry {
  model: AircraftModel;
  configId: string;
}

const AFTERBURNER_THRESHOLD = 0.9;

/** Keeps one 3-D model per aircraft view in the scene. */
export class SceneSync {
  private readonly scene: Scene;
  private readonly entries = new Map<number, Entry>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  update(views: Iterable<AircraftView>, timeS: number): void {
    const seen = new Set<number>();
    for (const v of views) {
      seen.add(v.id);
      let entry = this.entries.get(v.id);
      if (!entry || entry.configId !== v.config.id) {
        if (entry) this.scene.remove(entry.model.root);
        entry = { model: buildAircraftModel(v.config.visual), configId: v.config.id };
        this.entries.set(v.id, entry);
        this.scene.add(entry.model.root);
      }
      const root = entry.model.root;
      root.visible = v.alive;
      root.position.copy(v.position);
      root.quaternion.copy(v.quaternion);

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
