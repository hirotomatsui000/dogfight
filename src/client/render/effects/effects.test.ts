import { Color, LineSegments, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../../shared/ai/difficulty.ts';
import { buildTerrain } from '../../../shared/data/maps/map-definition.ts';
import { createTestRange } from '../../../shared/data/maps/test-range.ts';
import { StrikeMode } from '../../../shared/modes/strike.ts';
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

  it('drops a chaff cloud with the flares, and draws a Lance with its own model', () => {
    const scene = new Scene();
    const fx = new Effects(scene);
    const session = new LocalSession({ map, terrain, mode: new TeamDeathmatchMode(), aircraftId: 'kestrel', callsign: 'P' });
    session.update(1 / 60, neutralInput(0.8));
    const me = session.localView();
    if (!me) throw new Error('no local view');
    const before = fx.particleCount;
    fx.onEvent({ type: 'countermeasures', aircraftId: me.id }, session);
    // 36 chaff bits as grey haze plus every third as a glint; the flares only start burning on update.
    expect(fx.particleCount - before).toBe(36 + 12);
    const lance = { id: 1, kind: 'lance' as const, team: 'usa' as const, ownerId: me.id, targetId: null, position: new Vector3(0, 3000, 0), velocity: new Vector3(0, 0, -800), motorBurning: true };
    const fake = { ...session, missiles: () => [lance], views: () => session.views(), projectiles: () => [], bombs: () => [], groundTargets: () => [] };
    fx.update(1 / 60, fake as unknown as LocalSession, frame, new Vector3(0, 3000, 100));
    expect(scene.getObjectByName('lance')).toBeDefined();
    expect(scene.getObjectByName('missile')).toBeUndefined();
    fx.dispose();
  });

  it('blasts dust and fire where a bomb lands', () => {
    const scene = new Scene();
    const fx = new Effects(scene);
    const session = new LocalSession({ map, terrain, mode: new StrikeMode(), aircraftId: 'kobchik', callsign: 'P' });
    const before = fx.particleCount;
    fx.onEvent({ type: 'bombImpact', bombId: 1, x: 0, y: 100, z: 0 }, session);
    expect(fx.particleCount).toBeGreaterThan(before + 30);
    fx.dispose();
  });
});
