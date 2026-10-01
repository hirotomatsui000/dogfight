import { DoubleSide, Mesh, MeshBasicMaterial, type Scene, TorusGeometry, type Vector3 } from 'three';
import { RING_PASS_RADIUS_M } from '../../shared/modes/training.ts';

/** The next training ring as a glowing hoop facing the jet (spec §24, M1c). */
export class TrainingRings {
  private readonly scene: Scene;
  private readonly mesh: Mesh;

  constructor(scene: Scene) {
    this.scene = scene;
    const material = new MeshBasicMaterial({ color: 0x63ff95, transparent: true, opacity: 0.75, side: DoubleSide, depthWrite: false, fog: false });
    this.mesh = new Mesh(new TorusGeometry(RING_PASS_RADIUS_M, 9, 12, 96), material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  update(ring: { x: number; y: number; z: number } | null | undefined, viewer: Vector3): void {
    this.mesh.visible = Boolean(ring);
    if (!ring) return;
    this.mesh.position.set(ring.x, ring.y, ring.z);
    // Face the jet horizontally, so the hoop always reads as a ring to fly through.
    this.mesh.rotation.set(0, Math.atan2(viewer.x - ring.x, viewer.z - ring.z), 0);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
