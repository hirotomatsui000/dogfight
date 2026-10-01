import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { testView } from '../testing/views.ts';
import { SceneSync } from './scene-sync.ts';

const view = (id: number, alive = true, isLocal = false, throttle = 0.5) => {
  const v = testView(id, { alive, isLocal });
  v.flight.throttle = throttle;
  return v;
};
/** A camera 200 m south of the test views. */
const near = new Vector3(0, 1000, 200);

describe('SceneSync', () => {
  it('creates, positions, hides and removes models', () => {
    const scene = new Scene();
    const sync = new SceneSync(scene);
    sync.update([view(1), view(2, false)], 0, near);
    expect(sync.modelFor(1)?.root.position.x).toBe(100);
    expect(sync.modelFor(1)?.root.visible).toBe(true);
    expect(sync.modelFor(2)?.root.visible).toBe(false);
    sync.update([view(1)], 0, near);
    expect(sync.modelFor(2)).toBeUndefined();
    expect(scene.children).toHaveLength(1);
  });
  it('keeps the local aircraft visible: the camera is always outside it', () => {
    const sync = new SceneSync(new Scene());
    sync.update([view(1, true, true)], 0, near);
    expect(sync.modelFor(1)?.root.visible).toBe(true);
  });
  it('shows the afterburner only above 90% throttle', () => {
    const sync = new SceneSync(new Scene());
    sync.update([view(1, true, false, 0.5)], 0, near);
    expect(sync.modelFor(1)?.afterburners[0].visible).toBe(false);
    sync.update([view(1, true, false, 1)], 0, near);
    expect(sync.modelFor(1)?.afterburners[0].visible).toBe(true);
  });
  it('draws a distant aircraft larger so it never shrinks to a dot, and a near one at its real size', () => {
    const sync = new SceneSync(new Scene());
    sync.update([view(1)], 0, near);
    expect(sync.modelFor(1)?.root.scale.x).toBe(1);
    // 4 km away a 15 m Kestrel is drawn about 3.3 times larger (spec §15.4: at least 0.7°).
    sync.update([view(1)], 0, new Vector3(100, 1000, 4000));
    expect(sync.modelFor(1)?.root.scale.x).toBeCloseTo(3.26, 2);
  });
});
