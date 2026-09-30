import { Color, FogExp2, Quaternion, Vector2, Vector3 } from 'three';
import { DIFFICULTIES } from '../shared/ai/difficulty.ts';
import { buildTerrain } from '../shared/data/maps/map-definition.ts';
import { createTestRange } from '../shared/data/maps/test-range.ts';
import { CANNONS } from '../shared/data/weapons.ts';
import { timeToImpact } from '../shared/map/ground-proximity.ts';
import { DEG } from '../shared/math/units.ts';
import { FreeFlightMode } from '../shared/modes/free-flight.ts';
import type { GameMode } from '../shared/modes/mode.ts';
import { TeamDeathmatchMode } from '../shared/modes/team-deathmatch.ts';
import { atmosphere } from '../shared/physics/atmosphere.ts';
import { leadDirection } from '../shared/weapons/lead.ts';
import type { DeathCause, GameEvent } from '../shared/world/events.ts';
import { AudioEngine } from './audio/audio-engine.ts';
import { explosionGain, seekerTone } from './audio/sound-mix.ts';
import { CameraRig, type CameraTarget } from './camera/camera-rig.ts';
import { Hud } from './hud/hud.ts';
import { describeDeath, KillFeed } from './hud/kill-feed.ts';
import { ControlMapper, type ControlMode } from './input/control-mapper.ts';
import { DomInput } from './input/dom-input.ts';
import type { SceneryTextures } from './render/assets.ts';
import { Effects } from './render/effects/effects.ts';
import type { ParticleFrame } from './render/effects/particles.ts';
import { Renderer } from './render/renderer.ts';
import { SceneSync } from './render/scene-sync.ts';
import { Sea } from './render/sea.ts';
import { SkySystem } from './render/sky.ts';
import { createTerrainMaterial } from './render/terrain-material.ts';
import { TerrainMesh } from './render/terrain-mesh.ts';
import { LocalSession } from './session/local-session.ts';
import { matchResult, type ResultRow, showEndScreen } from './ui/end-screen.ts';
import type { StartOptions } from './ui/menu.ts';
import { PauseMenu } from './ui/pause.ts';
import { loadSetting, saveSetting } from './ui/storage.ts';

/** The gun lead marker shows for a designated target inside this range. */
const LEAD_MARKER_RANGE_M = 2000;
const HIT_MARKER_S = 0.25;
const BANNER_S = 1.5;
const EXPLOSION_SHAKE_RANGE_M = 1500;

const HINTS: Record<ControlMode, string> = {
  'mouse-aim': 'MOUSE aim · SPACE gun · F missile · X flares · R target · SHIFT/Z throttle · C look · TAB scores · P pause',
  direct: 'W/S pitch · A/D roll · Q/E rudder · SPACE gun · F missile · X flares · R target · SHIFT/Z throttle · C look · P pause',
};

export interface GameHandlers {
  /** back to the start menu */
  onQuit(): void;
  /** a new match with the same options */
  onRestart(options: StartOptions): void;
}

function showLoading(root: HTMLElement, text: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const panel = document.createElement('div');
  panel.className = 'panel narrow';
  panel.setAttribute('role', 'status');
  panel.textContent = text;
  overlay.appendChild(panel);
  root.appendChild(overlay);
  return overlay;
}

function createMode(options: StartOptions): GameMode {
  return options.mission === 'team-deathmatch' ? new TeamDeathmatchMode() : new FreeFlightMode();
}

function deathText(cause: DeathCause, killer: string | null): string {
  if (killer) return `SHOT DOWN BY ${killer}`;
  if (cause === 'boundary') return 'LEFT THE COMBAT AREA';
  if (cause === 'collision') return 'MID-AIR COLLISION';
  return 'CRASHED';
}

/**
 * Builds a local game in `root` once the scenery photos are loaded. `scenery` is usually already loaded by the
 * title screen. Resolves to a cleanup function.
 */
export async function startGame(
  root: HTMLElement,
  options: StartOptions,
  handlers: GameHandlers,
  scenery: Promise<SceneryTextures>,
): Promise<() => void> {
  // Created before the first await: browsers only let sound start from a click.
  let soundOn = loadSetting('sound', true);
  const audio = AudioEngine.create();
  audio?.setMuted(!soundOn);
  const loading = showLoading(root, 'Loading scenery…');
  const renderer = new Renderer(root);
  let textures;
  try {
    textures = await scenery;
  } catch (err) {
    renderer.dispose();
    audio?.dispose();
    loading.remove();
    throw new Error(`Could not load the scenery photos: ${err instanceof Error ? err.message : String(err)}`);
  }
  const map = createTestRange(1);
  const terrain = buildTerrain(map);
  const mode = createMode(options);
  const session = new LocalSession({
    map,
    terrain,
    mode,
    aircraftId: options.aircraftId,
    callsign: options.callsign,
    // A fresh seed per match varies gunfire spread, flare luck and the bot's aim; the World stays deterministic.
    seed: Math.floor(Math.random() * 0x7fffffff),
    opponents: options.mission === 'team-deathmatch' ? { count: 1, profile: DIFFICULTIES[options.difficulty] } : undefined,
  });
  new SkySystem(renderer.scene, renderer.webgl, textures.sky);
  renderer.scene.add(new TerrainMesh(terrain, map, createTerrainMaterial(textures)).group);
  const sea = new Sea(textures.waterNormals);
  renderer.scene.add(sea.mesh);
  loading.remove();
  const sceneSync = new SceneSync(renderer.scene);
  const effects = new Effects(renderer.scene);
  const cameraRig = new CameraRig(renderer.camera);
  cameraRig.reduceMotion = loadSetting('reduceMotion', false);
  const hud = new Hud(root);
  const input = new DomInput(renderer.webgl.domElement);
  input.attach();
  const mapper = new ControlMapper({ mode: options.controlMode });
  const killFeed = new KillFeed();
  const fog = renderer.scene.fog instanceof FogExp2 ? renderer.scene.fog : null;
  const particleFrame: ParticleFrame = { pixelScale: 1000, fogColor: new Color(), fogDensity: fog ? fog.density : 0 };
  if (fog) particleFrame.fogColor.copy(fog.color);
  const bufferSize = new Vector2();
  const lead = new Vector3();
  const burst = new Vector3();

  let paused = false;
  let matchOver = false;
  let running = true;
  let rafId = 0;
  let last = performance.now();
  let spawnGen = -1;
  let deathMessage: string | null = null;
  let respawnAt = 0;
  let hitMarkerUntil = 0;
  let banner: string | null = null;
  let bannerUntil = 0;
  let closeEndScreen: (() => void) | null = null;
  const target: CameraTarget = {
    position: new Vector3(),
    quaternion: new Quaternion(),
    gLoad: 1,
    mach: 0,
    throttle: 0,
    lookYaw: 0,
    lookPitch: 0,
  };

  const pause = new PauseMenu(root, {
    onResume: () => {
      pause.hide();
      paused = false;
      last = performance.now();
      input.requestPointerLock();
    },
    onQuit: () => {
      cleanup();
      handlers.onQuit();
    },
    onToggleControlMode: () => {
      mapper.settings.mode = mapper.settings.mode === 'mouse-aim' ? 'direct' : 'mouse-aim';
      saveSetting('controlMode', mapper.settings.mode);
      const me = session.localView();
      if (me) mapper.resetAim(me.flight);
      return mapper.settings.mode;
    },
    onToggleReduceMotion: () => {
      cameraRig.reduceMotion = !cameraRig.reduceMotion;
      saveSetting('reduceMotion', cameraRig.reduceMotion);
      return cameraRig.reduceMotion;
    },
    onToggleSound: () => {
      soundOn = !soundOn;
      saveSetting('sound', soundOn);
      audio?.setMuted(!soundOn);
      return soundOn;
    },
  });
  const openPause = () => {
    if (paused) return;
    paused = true;
    audio?.quiet();
    pause.show({ controlMode: mapper.settings.mode, reduceMotion: cameraRig.reduceMotion, sound: soundOn });
  };
  // Browsers swallow Esc while the pointer is locked and release the lock instead: treat that as "pause".
  const onPointerLockChange = () => {
    if (running && !matchOver && !input.pointerLocked && !paused) openPause();
  };
  document.addEventListener('pointerlockchange', onPointerLockChange);
  const onPointerDown = () => audio?.resume();
  root.addEventListener('pointerdown', onPointerDown);

  const showBanner = (text: string, nowS: number) => {
    banner = text;
    bannerUntil = nowS + BANNER_S;
  };

  const handleEvent = (e: GameEvent, nowS: number) => {
    effects.onEvent(e, session);
    const camPos = renderer.camera.position;
    if (e.type === 'destroyed') {
      const victim = session.view(e.aircraftId);
      const killer = e.killerId === null ? null : session.view(e.killerId);
      if (victim) {
        const local = victim.isLocal || (killer?.isLocal ?? false);
        killFeed.add(describeDeath(victim.callsign, killer?.callsign ?? null, e.cause), killer?.team ?? victim.team, local);
        const d = victim.position.distanceTo(camPos);
        audio?.explosion(explosionGain(d));
        if (d < EXPLOSION_SHAKE_RANGE_M) cameraRig.addTrauma(0.6 * (1 - d / EXPLOSION_SHAKE_RANGE_M));
      }
      if (e.aircraftId === session.localId) {
        deathMessage = deathText(e.cause, killer?.callsign ?? null);
        respawnAt = nowS + mode.respawnDelayS;
      } else if (killer?.isLocal) {
        showBanner('TARGET DESTROYED', nowS);
      }
    } else if (e.type === 'hit') {
      if (e.attackerId === session.localId) {
        hitMarkerUntil = nowS + HIT_MARKER_S;
        audio?.hit();
      }
      if (e.aircraftId === session.localId) {
        cameraRig.addTrauma(0.3);
        audio?.hit();
      }
    } else if (e.type === 'missileLaunched') {
      if (e.shooterId === session.localId) audio?.launch();
    } else if (e.type === 'missileDetonated') {
      const d = camPos.distanceTo(burst.set(e.x, e.y, e.z));
      audio?.explosion(explosionGain(d) * 0.6);
      if (d < EXPLOSION_SHAKE_RANGE_M) cameraRig.addTrauma(0.4 * (1 - d / EXPLOSION_SHAKE_RANGE_M));
    } else if (e.type === 'missileDecoyed') {
      if (e.targetId === session.localId) showBanner('MISSILE DECOYED', nowS);
    } else if (e.type === 'countermeasures') {
      if (e.aircraftId === session.localId) audio?.flare();
    }
  };

  const endMatch = () => {
    matchOver = true;
    audio?.quiet();
    if (input.pointerLocked) document.exitPointerLock();
    const me = session.localView();
    const rows: ResultRow[] = [...session.views()]
      .map((v) => ({ callsign: v.callsign, aircraft: v.config.name, team: v.team, kills: v.kills, deaths: v.deaths, isLocal: v.isLocal }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    closeEndScreen = showEndScreen(root, matchResult(session.modeStatus(), me ? me.team : 'usa'), rows, {
      onAgain: () => {
        cleanup();
        handlers.onRestart(options);
      },
      onMenu: () => {
        cleanup();
        handlers.onQuit();
      },
    });
  };

  const frame = (now: number) => {
    if (!running) return;
    const nowS = now / 1000;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const snap = input.snapshot();
    if (!matchOver && (snap.pressed.has('KeyP') || snap.pressed.has('Escape'))) {
      if (paused) {
        pause.hide();
        paused = false;
      } else {
        openPause();
      }
    }

    const active = !paused && !matchOver;
    if (active) {
      const me = session.localView();
      if (me && me.spawnGen !== spawnGen) {
        spawnGen = me.spawnGen;
        mapper.resetAim(me.flight);
        cameraRig.reset();
        hud.resetMaxG();
        deathMessage = null;
      }
      const controls = mapper.map(snap, me && me.alive ? me.flight : null, dt);
      session.update(dt, controls);
      for (const e of session.drainEvents()) handleEvent(e, nowS);
      killFeed.update(dt);
      if (session.modeStatus().winner !== null) endMatch();
    }

    const local = session.localView();
    if (local) {
      if (local.alive) {
        target.position.copy(local.position);
        target.quaternion.copy(local.quaternion);
        target.gLoad = local.flight.gLoad;
        target.mach = local.flight.mach;
        target.throttle = local.flight.throttle;
      } else {
        target.gLoad = 1;
        target.mach = 0;
        target.throttle = 0;
      }
      target.lookYaw = mapper.lookYaw;
      target.lookPitch = mapper.lookPitch;
    }
    const aim = mapper.settings.mode === 'mouse-aim' ? mapper.aimDirection : null;
    cameraRig.update(active ? dt : 0, local ? target : null, aim);
    sceneSync.update(session.views(), nowS);
    renderer.webgl.getDrawingBufferSize(bufferSize);
    particleFrame.pixelScale = bufferSize.y / (2 * Math.tan((renderer.camera.fov * DEG) / 2));
    effects.update(active ? dt : 0, session, particleFrame);
    sea.update(nowS);
    renderer.render();

    if (local) {
      const f = local.flight;
      const designated = local.targetId === null ? null : session.view(local.targetId);
      const targetView = designated && designated.alive ? designated : null;
      let leadDir: Vector3 | null = null;
      if (targetView && local.alive && f.pos.distanceTo(targetView.flight.pos) < LEAD_MARKER_RANGE_M) {
        const cannon = CANNONS[local.config.stores.cannon];
        leadDirection(f.pos, f.vel, targetView.flight.pos, targetView.flight.vel, cannon.muzzleSpeedMs, cannon.dragPerM * atmosphere(f.pos.y).sigma, lead);
        leadDir = lead;
      }
      const message = paused || !deathMessage ? null : `${deathMessage} — RESPAWN IN ${Math.max(0, Math.ceil(respawnAt - nowS))}`;
      hud.draw({
        view: local,
        views: [...session.views()],
        missiles: [...session.missiles()],
        target: targetView,
        leadDirection: leadDir,
        camera: renderer.camera,
        aimDirection: aim,
        status: session.modeStatus(),
        radarAltitudeM: f.pos.y - terrain.surfaceAt(f.pos.x, f.pos.z),
        pullUp: local.alive && timeToImpact(f, terrain) !== null,
        message,
        banner: nowS < bannerUntil ? banner : null,
        hint: HINTS[mapper.settings.mode],
        killFeed: killFeed.lines,
        hitMarker: nowS < hitMarkerUntil,
        showScoreboard: snap.keys.has('Tab') && !paused,
        dt,
      });
      if (audio && active) {
        audio.update({
          alive: local.alive,
          throttle: f.throttle,
          airspeedMs: f.airspeed,
          seeker: seekerTone(local.seeker.mode),
          missileWarning: local.incoming !== null,
          firingCannon: local.firingCannon,
          cannonRateHz: CANNONS[local.config.stores.cannon].projectilesPerS,
          timeS: nowS,
        });
      }
    } else {
      hud.draw(null);
    }
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
  input.requestPointerLock();

  function cleanup(): void {
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    root.removeEventListener('pointerdown', onPointerDown);
    input.detach();
    pause.dispose();
    closeEndScreen?.();
    hud.dispose();
    effects.dispose();
    sceneSync.dispose();
    session.dispose();
    renderer.dispose();
    audio?.dispose();
  }
  return cleanup;
}
