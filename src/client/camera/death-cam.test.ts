import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { cycleWatch, DeathCam, KILLCAM_S, killcamFov, killcamPosition, type WatchableView, watchOrder } from './death-cam.ts';

const v = (id: number, team: TeamId, alive = true, support = false, isLocal = false): WatchableView => ({ id, team, alive, isLocal, position: new Vector3(id * 100, 3000, 0), config: { support } });

describe('death camera (M5)', () => {
  const views = [v(1, 'usa', false, false, true), v(5, 'russia'), v(2, 'usa'), v(9, 'russia', true, true), v(3, 'usa', false), v(4, 'russia')];

  it('watches teammates first, then the enemy, then Sentinels, skipping the dead and yourself', () => {
    expect(watchOrder(views, 'usa').map((x) => x.id)).toEqual([2, 4, 5, 9]);
    expect(watchOrder(views, 'russia').map((x) => x.id)).toEqual([4, 5, 2, 9]);
    expect(cycleWatch(views, 'usa', 2, 1)).toBe(4);
    expect(cycleWatch(views, 'usa', 9, 1)).toBe(2);
    expect(cycleWatch(views, 'usa', 2, -1)).toBe(9);
    expect(cycleWatch(views, 'usa', null, 1)).toBe(2);
    expect(cycleWatch([], 'usa', null, 1)).toBeNull();
  });

  it('shows the killer for 2.5 s, then spectates starting with the killer', () => {
    const cam = new DeathCam();
    cam.start(new Vector3(), 5);
    cam.update(KILLCAM_S - 0.1, views, 'usa');
    expect(cam.phase).toBe('killcam');
    cam.update(0.2, views, 'usa');
    expect(cam.phase).toBe('spectate');
    expect(cam.watchingId).toBe(5);
    cam.cycle(views, 'usa', 1);
    expect(cam.watchingId).toBe(9);
    cam.stop();
    expect(cam.phase).toBe('off');
  });

  it('moves on when the watched jet goes down, and skips the kill cam on a switch', () => {
    const cam = new DeathCam();
    cam.start(new Vector3(), null);
    cam.cycle(views, 'usa', 1);
    expect(cam.phase).toBe('spectate');
    expect(cam.watchingId).toBe(2);
    const later = views.map((x) => (x.id === 2 ? { ...x, alive: false } : x));
    cam.update(0.1, later, 'usa');
    expect(cam.watchingId).toBe(4);
  });

  it('frames a far killer with a narrow view and stands behind the wreck', () => {
    expect(killcamFov(200)).toBeGreaterThan(killcamFov(3000));
    expect(killcamFov(50_000)).toBe(6);
    expect(killcamFov(10)).toBe(70);
    const wreck = new Vector3(0, 2000, 0);
    const at = killcamPosition(wreck, new Vector3(1000, 2500, 0), new Vector3());
    expect(at.x).toBeLessThan(0);
    expect(at.y).toBeGreaterThan(wreck.y);
  });
});
