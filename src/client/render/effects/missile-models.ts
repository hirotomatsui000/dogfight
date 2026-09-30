import { CylinderGeometry, Mesh, MeshStandardMaterial, Quaternion, type Scene, Vector3 } from 'three';
import type { MissileView } from '../../session/game-session.ts';

const FORWARD = new Vector3(0, 0, -1);

/** One small body per missile in flight, pointed along its velocity. */
export class MissileModels {
  private readonly scene: Scene;
  private readonly geometry = new CylinderGeometry(0.09, 0.09, 2.9, 8).rotateX(Math.PI / 2);
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

  update(missiles: Iterable<MissileView>): void {
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
