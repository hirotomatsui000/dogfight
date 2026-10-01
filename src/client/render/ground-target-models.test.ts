import { Mesh, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { GroundTargetView } from '../session/game-session.ts';
import { buildTargetModel, GroundTargetModels } from './ground-target-models.ts';

const view = (id: string, kind: GroundTargetView['kind']): GroundTargetView => ({ id, kind, label: id, position: new Vector3(100, 50, -200), maxHp: 100, hp: 100, destroyed: false });

describe('GroundTargetModels', () => {
  it('builds a pad and structures for every kind of target', () => {
    for (const kind of ['depot', 'radar', 'fuel'] as const) {
      const meshes: Mesh[] = [];
      buildTargetModel(kind).traverse((o) => {
        if (o instanceof Mesh) meshes.push(o);
      });
      expect(meshes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('places one model per target and flattens it when destroyed', () => {
    const scene = new Scene();
    const models = new GroundTargetModels(scene);
    const targets = [view('A', 'depot'), view('B', 'radar'), view('C', 'fuel')];
    models.update(targets);
    expect(scene.children.length).toBe(3);
    expect(scene.children[1].position.equals(targets[1].position)).toBe(true);
    targets[1].destroyed = true;
    models.update(targets);
    const heights: number[] = [];
    scene.children[1].traverse((o) => {
      if (o instanceof Mesh && o.name === 'structure') heights.push(o.scale.y);
    });
    expect(heights.length).toBeGreaterThan(0);
    expect(Math.max(...heights)).toBeLessThan(0.5);
    models.dispose();
    expect(scene.children.length).toBe(0);
  });
});
