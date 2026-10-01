import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { MissileView } from '../../session/game-session.ts';
import { MissileModels } from './missile-models.ts';

const missile = (): MissileView => ({
  id: 1,
  team: 'russia',
  ownerId: 2,
  targetId: 3,
  position: new Vector3(0, 1000, 0),
  velocity: new Vector3(0, 0, -800),
  motorBurning: true,
});

describe('MissileModels', () => {
  it('draws a distant missile larger so it stays visible, and a near one at its real size', () => {
    const scene = new Scene();
    const models = new MissileModels(scene);
    models.update([missile()], new Vector3(0, 1000, 100));
    const mesh = scene.children.find((o) => o.name === 'missile');
    expect(mesh?.scale.x).toBe(1);
    // 3 km away the 2.9 m missile is drawn about 7 times larger (spec §15.4: at least 0.4°).
    models.update([missile()], new Vector3(0, 1000, 3000));
    expect(mesh?.scale.x).toBeCloseTo((3000 * Math.tan((0.4 * Math.PI) / 180)) / 2.9, 3);
  });
});
