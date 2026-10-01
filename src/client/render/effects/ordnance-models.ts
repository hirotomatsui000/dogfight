import { CylinderGeometry, Mesh, MeshStandardMaterial, Quaternion, type Scene, Vector3 } from 'three';
import { DEG } from '../../../shared/math/units.ts';
import { visibilityScale } from '../visibility.ts';

const FORWARD = new Vector3(0, 0, -1);

/** How one kind of ordnance looks, and the smallest it may appear before it is drawn larger (spec §15.4). */
export interface OrdnanceLook {
  name: string;
  lengthM: number;
  radiusM: number;
  color: number;
  minApparentAngleRad: number;
  maxScale: number;
}

export const MISSILE_LOOK: OrdnanceLook = { name: 'missile', lengthM: 2.9, radiusM: 0.09, color: 0xc9cdd1, minApparentAngleRad: 0.4 * DEG, maxScale: 12 };
export const BOMB_LOOK: OrdnanceLook = { name: 'bomb', lengthM: 2.2, radiusM: 0.2, color: 0x3f4537, minApparentAngleRad: 0.3 * DEG, maxScale: 10 };

export interface OrdnanceItem {
  readonly id: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
}

/** One small body per missile or bomb in flight, pointed along its velocity. */
export class OrdnanceModels {
  private readonly scene: Scene;
  private readonly look: OrdnanceLook;
  private readonly geometry: CylinderGeometry;
  private readonly material: MeshStandardMaterial;
  private readonly meshes = new Map<number, Mesh>();
  private readonly dir = new Vector3();
  private readonly q = new Quaternion();

  constructor(scene: Scene, look: OrdnanceLook) {
    this.scene = scene;
    this.look = look;
    this.geometry = new CylinderGeometry(look.radiusM, look.radiusM, look.lengthM, 8).rotateX(Math.PI / 2);
    this.material = new MeshStandardMaterial({ color: look.color, roughness: 0.5, metalness: 0.3 });
  }

  get count(): number {
    return this.meshes.size;
  }

  update(items: Iterable<OrdnanceItem>, cameraPos: Vector3): void {
    const look = this.look;
    const seen = new Set<number>();
    for (const m of items) {
      seen.add(m.id);
      let mesh = this.meshes.get(m.id);
      if (!mesh) {
        mesh = new Mesh(this.geometry, this.material);
        mesh.name = look.name;
        this.meshes.set(m.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.copy(m.position);
      mesh.scale.setScalar(visibilityScale(m.position.distanceTo(cameraPos), look.lengthM, look.minApparentAngleRad, look.maxScale));
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
