import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BOMB_LOOK, MISSILE_LOOK, OrdnanceModels } from './ordnance-models.ts';

const item = () => ({ id: 1, position: new Vector3(0, 1000, 0), velocity: new Vector3(0, 0, -800) });

describe('OrdnanceModels', () => {
  it('draws a distant missile larger so it stays visible, and a near one at its real size', () => {
    const scene = new Scene();
    const models = new OrdnanceModels(scene, MISSILE_LOOK);
    models.update([item()], new Vector3(0, 1000, 100));
    const mesh = scene.children.find((o) => o.name === 'missile');
    expect(mesh?.scale.x).toBe(1);
    // 3 km away the 2.9 m missile is drawn about 7 times larger (spec §15.4: at least 0.4°).
    models.update([item()], new Vector3(0, 1000, 3000));
    expect(mesh?.scale.x).toBeCloseTo((3000 * Math.tan((0.4 * Math.PI) / 180)) / 2.9, 3);
  });

  it('draws bombs with their own look and removes them once they are gone', () => {
    const scene = new Scene();
    const models = new OrdnanceModels(scene, BOMB_LOOK);
    models.update([item()], new Vector3(0, 1000, 3000));
    expect(scene.children.find((o) => o.name === 'bomb')?.scale.x).toBeCloseTo((3000 * Math.tan((0.3 * Math.PI) / 180)) / 2.2, 3);
    models.update([], new Vector3());
    expect(models.count).toBe(0);
  });
});
