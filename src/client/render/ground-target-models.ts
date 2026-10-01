import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Scene, SphereGeometry } from 'three';
import type { GroundTargetKind } from '../../shared/data/maps/map-definition.ts';
import type { GroundTargetView } from '../session/game-session.ts';

const PAD_M = 70;
const WRECK_SCALE = 0.25;

const concrete = new MeshStandardMaterial({ color: 0x8d8b84, roughness: 0.95 });
const wall = new MeshStandardMaterial({ color: 0x6b6f5c, roughness: 0.85 });
const metal = new MeshStandardMaterial({ color: 0xb8bcb8, roughness: 0.4, metalness: 0.5 });
const wreck = new MeshStandardMaterial({ color: 0x24221f, roughness: 1 });

function structure(geometry: BoxGeometry | CylinderGeometry | SphereGeometry, x: number, y: number, z: number, material = wall): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = 'structure';
  mesh.position.set(x, y, z);
  return mesh;
}

/** Simple fictional facilities built from boxes and cylinders on a concrete pad (spec §15.4). */
export function buildTargetModel(kind: GroundTargetKind): Group {
  const g = new Group();
  const pad = new Mesh(new BoxGeometry(PAD_M, 0.6, PAD_M), concrete);
  pad.position.y = 0.3;
  g.add(pad);
  if (kind === 'depot') {
    for (const x of [-20, 0, 20]) g.add(structure(new BoxGeometry(14, 7, 26), x, 3.5, 0));
  } else if (kind === 'radar') {
    g.add(structure(new BoxGeometry(5, 16, 5), 0, 8, 0, metal));
    const dish = structure(new SphereGeometry(7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), 0, 17, 0, metal);
    dish.rotation.x = Math.PI / 2;
    g.add(dish);
    g.add(structure(new BoxGeometry(16, 5, 10), 18, 2.5, 14));
  } else {
    for (const [x, z] of [
      [-16, -12],
      [16, -12],
      [0, 14],
    ]) {
      g.add(structure(new CylinderGeometry(8, 8, 10, 20), x, 5, z, metal));
    }
  }
  return g;
}

/** One model per Strike target; destroyed targets collapse into dark wreckage. */
export class GroundTargetModels {
  private readonly scene: Scene;
  private readonly groups = new Map<string, { root: Group; wrecked: boolean }>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  update(targets: readonly GroundTargetView[]): void {
    for (const t of targets) {
      let entry = this.groups.get(t.id);
      if (!entry) {
        const root = buildTargetModel(t.kind);
        root.position.copy(t.position);
        entry = { root, wrecked: false };
        this.groups.set(t.id, entry);
        this.scene.add(root);
      }
      if (t.destroyed && !entry.wrecked) {
        entry.wrecked = true;
        entry.root.traverse((o) => {
          if (!(o instanceof Mesh) || o.name !== 'structure') return;
          o.scale.y = WRECK_SCALE;
          o.position.y *= WRECK_SCALE;
          o.material = wreck;
        });
      }
    }
  }

  dispose(): void {
    for (const { root } of this.groups.values()) {
      this.scene.remove(root);
      root.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    }
    this.groups.clear();
  }
}
