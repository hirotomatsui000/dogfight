import { Color, Group, LineSegments, Mesh, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../../shared/ai/difficulty.ts';
import { condor } from '../../../shared/data/aircraft/condor.ts';
import { buildTerrain } from '../../../shared/data/maps/map-definition.ts';
import { createTestRange } from '../../../shared/data/maps/test-range.ts';
import { StrikeMode } from '../../../shared/modes/strike.ts';
import { TeamDeathmatchMode } from '../../../shared/modes/team-deathmatch.ts';
import { neutralInput } from '../../../shared/physics/controls.ts';
import { LocalSession } from '../../session/local-session.ts';
import { testView } from '../../testing/views.ts';
import { createAfterburner, setAfterburner } from './afterburner.ts';
import { Effects } from './effects.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const frame = { pixelScale: 800, fogColor: new Color(), fogDensity: 2.8e-5 };

describe('Effects', () => {
  it('adds and removes its scene objects', () => {
    const scene = new Scene();
    const fx = new Effects(scene);
    // Smoke, fire, tracer lines and heads, contrails and vapour.
    expect(scene.children.length).toBe(6);
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

  it('leaves contrails above 8 km and wingtip vapour above 5 G (M5)', () => {
    const scene = new Scene();
    const fx = new Effects(scene);
    const v = testView(1, { config: condor, isLocal: true });
    const session = { views: () => [v], missiles: () => [], projectiles: () => [], bombs: () => [], groundTargets: () => [] } as unknown as LocalSession;
    const drawn = () => scene.children.filter((o): o is Mesh => o instanceof Mesh).map((m) => m.geometry.drawRange.count);
    const fly = (altitude: number, g: number) => {
      v.position.set(0, altitude, 0);
      v.flight.gLoad = g;
      for (let i = 0; i < 60; i++) {
        v.position.z -= 4;
        fx.update(1 / 60, session, frame, new Vector3(0, altitude + 7, 30));
      }
    };
    fly(3000, 1);
    expect(drawn()).toEqual([0, 0]);
    fly(9000, 6);
    const [contrails, vapour] = drawn();
    expect(contrails).toBeGreaterThan(0);
    expect(vapour).toBeGreaterThan(0);
    fx.dispose();
  });

  it('drops a burning wreck that bursts on the ground, except after a crash (M5)', () => {
    const scene = new Scene();
    const model = new Group();
    model.name = 'jet';
    // A twin on afterburner when it was hit: the wreck keeps neither flame.
    for (const x of [-1, 1]) {
      const flame = createAfterburner(0.5);
      flame.position.x = x;
      setAfterburner(flame, 1, 0);
      model.add(flame);
    }
    const fx = new Effects(scene, { terrain, wreckModel: () => model });
    const v = testView(1, { config: condor });
    v.position.set(0, 400, 0);
    v.flight.vel.set(0, -50, -150);
    const session = { view: () => v, views: () => [], missiles: () => [], projectiles: () => [], bombs: () => [], groundTargets: () => [] } as unknown as LocalSession;
    fx.onEvent({ type: 'destroyed', aircraftId: 1, cause: 'crash', killerId: null }, session);
    expect(scene.getObjectByName('jet')).toBeUndefined();
    fx.onEvent({ type: 'destroyed', aircraftId: 1, cause: 'missile', killerId: 2 }, session);
    expect(scene.getObjectByName('jet')).toBeDefined();
    expect(scene.getObjectByName('jet')?.getObjectByName('afterburner')).toBeUndefined();
    expect(model.getObjectByName('afterburner')).toBeDefined();
    for (let i = 0; i < 20 * 60 && scene.getObjectByName('jet'); i++) fx.update(1 / 60, session, frame, new Vector3());
    expect(scene.getObjectByName('jet')).toBeUndefined();
    const impacts = fx.drainImpacts();
    expect(impacts).toHaveLength(1);
    expect(impacts[0].y).toBeCloseTo(terrain.surfaceAt(impacts[0].x, impacts[0].z) + 2, 0);
    fx.dispose();
  });
});
