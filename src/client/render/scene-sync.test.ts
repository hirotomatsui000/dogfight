import { Quaternion, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { kestrel } from '../../shared/data/aircraft/kestrel.ts';
import { createFlightState } from '../../shared/physics/flight-model.ts';
import type { AircraftView } from '../session/game-session.ts';
import { SceneSync } from './scene-sync.ts';

const view = (id: number, alive = true, isLocal = false, throttle = 0.5): AircraftView => {
  const flight = createFlightState({ position: new Vector3(id * 100, 1000, 0), headingRad: 0, speed: 200, throttle });
  return {
    id, callsign: `P${id}`, team: 'usa', config: kestrel, isLocal, isBot: false, alive, hp: 80, spawnGen: 1,
    position: flight.pos.clone(), quaternion: new Quaternion(), flight, boundarySecondsLeft: null,
  };
};

describe('SceneSync', () => {
  it('creates, positions, hides and removes models', () => {
    const scene = new Scene();
    const sync = new SceneSync(scene);
    sync.update([view(1), view(2, false)], false, 0);
    expect(sync.modelFor(1)?.root.position.x).toBe(100);
    expect(sync.modelFor(1)?.root.visible).toBe(true);
    expect(sync.modelFor(2)?.root.visible).toBe(false);
    sync.update([view(1)], false, 0);
    expect(sync.modelFor(2)).toBeUndefined();
    expect(scene.children).toHaveLength(1);
  });
  it('hides the local aircraft in first-person views', () => {
    const sync = new SceneSync(new Scene());
    sync.update([view(1, true, true)], true, 0);
    expect(sync.modelFor(1)?.root.visible).toBe(false);
  });
  it('shows the afterburner only above 90% throttle', () => {
    const sync = new SceneSync(new Scene());
    sync.update([view(1, true, false, 0.5)], false, 0);
    expect(sync.modelFor(1)?.afterburners[0].visible).toBe(false);
    sync.update([view(1, true, false, 1)], false, 0);
    expect(sync.modelFor(1)?.afterburners[0].visible).toBe(true);
  });
});
