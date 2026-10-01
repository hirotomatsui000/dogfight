import { CylinderGeometry, Mesh, MeshStandardMaterial, Quaternion, type Scene, Vector3 } from 'three';
import { DEG } from '../../../shared/math/units.ts';
import type { MissileView } from '../../session/game-session.ts';
import { visibilityScale } from '../visibility.ts';

const FORWARD = new Vector3(0, 0, -1);
const LENGTH_M = 2.9;
/** A missile never looks smaller than this (spec §15.4), so you can watch it come. */
const MIN_APPARENT_ANGLE = 0.4 * DEG;
const MAX_VISIBILITY_SCALE = 12;

/** One small body per missile in flight, pointed along its velocity. */
export class MissileModels {
  private readonly scene: Scene;
  private readonly geometry = new CylinderGeometry(0.09, 0.09, LENGTH_M, 8).rotateX(Math.PI / 2);
  private readonly material = new MeshStandardMaterial({ color: 0xc9cdd1, roughness: 0.5, metalness: 0.3 });
  private readonly meshes = new Map<number, Mesh>();
  private readonly dir = new Vector3();
  private readonly q = new Quaternion();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  get count(): number {
    return this.meshes.size;
  }

  update(missiles: Iterable<MissileView>, cameraPos: Vector3): void {
    const seen = new Set<number>();
    for (const m of missiles) {
      seen.add(m.id);
      let mesh = this.meshes.get(m.id);
      if (!mesh) {
        mesh = new Mesh(this.geometry, this.material);
        mesh.name = 'missile';
        this.meshes.set(m.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.copy(m.position);
      mesh.scale.setScalar(visibilityScale(m.position.distanceTo(cameraPos), LENGTH_M, MIN_APPARENT_ANGLE, MAX_VISIBILITY_SCALE));
      if (m.velocity.lengthSq() > 1) mesh.quaternion.copy(this.q.setFromUnitVectors(FORWARD, this.dir.copy(m.velocity).normalize()));
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.meshes.delete(id);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) this.scene.remove(mesh);
    this.meshes.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
