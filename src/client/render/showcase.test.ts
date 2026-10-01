import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createLechovia } from '../../shared/data/maps/lechovia/index.ts';
import { buildTerrain } from '../../shared/data/maps/map-definition.ts';
import { showcaseCameraPosition, showcaseJetPose } from './showcase.ts';

const pose = () => ({ position: new Vector3(), quaternion: new Quaternion() });
const nose = (q: Quaternion) => new Vector3(0, 0, -1).applyQuaternion(q);
const rightWing = (q: Quaternion) => new Vector3(1, 0, 0).applyQuaternion(q);
/** Ten minutes in half-second steps: longer than any lap of the title-screen loop. */
const times = Array.from({ length: 1200 }, (_, i) => i * 0.5);

describe('title-screen jet', () => {
  it('stays over Lechovia, well clear of the ground', () => {
    const map = createLechovia();
    const terrain = buildTerrain(map);
    const p = pose();
    for (const t of times) {
      showcaseJetPose(t, p);
      expect(Math.max(Math.abs(p.position.x), Math.abs(p.position.z))).toBeLessThan(map.sizeM / 2 - 5000);
      expect(p.position.y - terrain.surfaceAt(p.position.x, p.position.z)).toBeGreaterThan(400);
    }
    // Generating Lechovia takes a few seconds, more on a busy machine.
  }, 30000);

  it('flies nose first and banks into its turn', () => {
    const a = pose();
    const b = pose();
    for (const t of [0, 40, 95, 170]) {
      showcaseJetPose(t, a);
      showcaseJetPose(t + 0.1, b);
      const travel = b.position.clone().sub(a.position).normalize();
      expect(travel.dot(nose(a.quaternion))).toBeGreaterThan(0.999);
      // Turning toward the right wing means the right wing is the low one.
      const turn = nose(b.quaternion).sub(nose(a.quaternion)).dot(rightWing(a.quaternion));
      expect(Math.sign(turn)).toBe(-Math.sign(rightWing(a.quaternion).y));
      expect(Math.abs(rightWing(a.quaternion).y)).toBeGreaterThan(Math.sin((10 * Math.PI) / 180));
    }
  });
});

describe('title-screen camera', () => {
  it('stays close to the jet and a little above it', () => {
    const p = pose();
    const cam = new Vector3();
    for (const t of times) {
      showcaseJetPose(t, p);
      showcaseCameraPosition(t, p, cam);
      const d = cam.distanceTo(p.position);
      expect(d).toBeGreaterThan(20);
      expect(d).toBeLessThan(60);
      expect(cam.y).toBeGreaterThan(p.position.y);
    }
  });

  it('circles the jet, seeing it from behind and from ahead within a minute', () => {
    const p = pose();
    const cam = new Vector3();
    let behind = false;
    let ahead = false;
    for (const t of times.filter((s) => s <= 60)) {
      showcaseJetPose(t, p);
      showcaseCameraPosition(t, p, cam);
      const along = cam.clone().sub(p.position).normalize().dot(nose(p.quaternion));
      behind ||= along < -0.8;
      ahead ||= along > 0.8;
    }
    expect(behind && ahead).toBe(true);
  });
});
