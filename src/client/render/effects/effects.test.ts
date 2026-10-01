import { Color, LineSegments, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../../shared/ai/difficulty.ts';
import { buildTerrain } from '../../../shared/data/maps/map-definition.ts';
import { createTestRange } from '../../../shared/data/maps/test-range.ts';
import { TeamDeathmatchMode } from '../../../shared/modes/team-deathmatch.ts';
import { neutralInput } from '../../../shared/physics/controls.ts';
import { LocalSession } from '../../session/local-session.ts';
import { Effects } from './effects.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const frame = { pixelScale: 800, fogColor: new Color(), fogDensity: 2.8e-5 };

describe('Effects', () => {
  it('adds and removes its scene objects', () => {
    const scene = new Scene();
    const fx = new Effects(scene);
    expect(scene.children.length).toBe(4);
    fx.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('draws tracers and flares from a live session', () => {
    const scene = new Scene();
    const fx = new Effects(scene);
    const session = new LocalSession({ map, terrain, mode: new TeamDeathmatchMode(), aircraftId: 'kestrel', callsign: 'P', opponents: { count: 1, profile: DIFFICULTIES.rookie } });
    for (let i = 0; i < 20; i++) {
      session.update(1 / 60, { ...neutralInput(0.8), fireCannon: true, countermeasures: i === 0 });
      for (const e of session.drainEvents()) fx.onEvent(e, session);
      fx.update(1 / 60, session, frame, new Vector3(0, 3000, 0));
    }
    const tracers = scene.children.find((o): o is LineSegments => o instanceof LineSegments);
    expect(tracers?.geometry.drawRange.count).toBeGreaterThan(0);
    fx.dispose();
  });
});
