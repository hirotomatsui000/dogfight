import { Color, FogExp2, Quaternion, Vector2, Vector3 } from 'three';
import { DIFFICULTIES } from '../shared/ai/difficulty.ts';
import { buildTerrain } from '../shared/data/maps/map-definition.ts';
import { createTestRange } from '../shared/data/maps/test-range.ts';
import { BOMB_ANVIL, CANNONS } from '../shared/data/weapons.ts';
import { timeToImpact } from '../shared/map/ground-proximity.ts';
import { DEG } from '../shared/math/units.ts';
import { FreeFlightMode } from '../shared/modes/free-flight.ts';
import type { GameMode } from '../shared/modes/mode.ts';
import { StrikeMode } from '../shared/modes/strike.ts';
import { TeamDeathmatchMode } from '../shared/modes/team-deathmatch.ts';
import { atmosphere } from '../shared/physics/atmosphere.ts';
import { predictImpact } from '../shared/weapons/bomb.ts';
import { leadDirection } from '../shared/weapons/lead.ts';
import type { DeathCause, GameEvent } from '../shared/world/events.ts';
import { DT } from '../shared/world/world.ts';
import { AudioEngine } from './audio/audio-engine.ts';
import { explosionGain, seekerTone } from './audio/sound-mix.ts';
import { CameraRig, type CameraTarget } from './camera/camera-rig.ts';
import { Hud } from './hud/hud.ts';
import { describeDeath, KillFeed } from './hud/kill-feed.ts';
import { releaseCue, TargetAlerts, targetDestroyedText } from './hud/strike-hud.ts';
import { BASE_MOUSE_SENSITIVITY, ControlMapper, type ControlMode } from './input/control-mapper.ts';
import { capturedKeys, DomInput } from './input/dom-input.ts';
import { GamepadReader, pollGamepad } from './input/gamepad.ts';
import { type AircraftMeshes, aircraftModelFor } from './render/aircraft-meshes.ts';
import { type SceneryTextures, setSceneryAnisotropy } from './render/assets.ts';
import { Effects } from './render/effects/effects.ts';
import type { LoadProgress } from './render/load-progress.ts';
import { QUALITY_PRESETS, QualityGovernor, type QualityLevel, resolveQuality } from './render/quality.ts';
import { GroundTargetModels } from './render/ground-target-models.ts';
import type { ParticleFrame } from './render/effects/particles.ts';
import { Renderer } from './render/renderer.ts';
import { SceneSync } from './render/scene-sync.ts';
import { Sea } from './render/sea.ts';
import { SkySystem } from './render/sky.ts';
import { createTerrainMaterial } from './render/terrain-material.ts';
import { TerrainMesh } from './render/terrain-mesh.ts';
import { LocalSession } from './session/local-session.ts';
import { setHudColor } from './hud/palette.ts';
import { matchResult, type ResultRow, showEndScreen } from './ui/end-screen.ts';
import { loadingText } from './ui/load-bar.ts';
import type { StartOptions } from './ui/menu.ts';
import { PauseMenu } from './ui/pause.ts';
import { openSettings } from './ui/settings-screen.ts';
import type { Settings, SettingsStore } from './ui/settings.ts';

/** The gun lead marker shows for a designated target inside this range. */
const LEAD_MARKER_RANGE_M = 2000;
const HIT_MARKER_S = 0.25;
/** How long HIT shows after the local jet is hit (the caption of the hit sound). */
const HIT_TAKEN_S = 0.6;
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
  if (options.mission === 'strike') return new StrikeMode();
  return options.mission === 'team-deathmatch' ? new TeamDeathmatchMode() : new FreeFlightMode();
}

function deathText(cause: DeathCause, killer: string | null): string {
  if (killer) return `SHOT DOWN BY ${killer}`;
  if (cause === 'boundary') return 'LEFT THE COMBAT AREA';
  if (cause === 'collision') return 'MID-AIR COLLISION';
  return 'CRASHED';
}

/**
 * Builds a local game in `root` once the scenery photos and jet models are loaded. Both are usually already loaded by
 * the title screen. Resolves to a cleanup function.
 */
export async function startGame(
  root: HTMLElement,
  options: StartOptions,
  handlers: GameHandlers,
  scenery: Promise<SceneryTextures>,
  aircraftMeshes: Promise<AircraftMeshes>,
  settings: SettingsStore,
  progress: LoadProgress,
): Promise<() => void> {
  // Created before the first await: browsers only let sound start from a click.
  const audio = AudioEngine.create();
  audio?.setVolume(settings.current.volume);
  audio?.setMuted(!settings.current.sound);
  const loading = showLoading(root, loadingText(progress));
  const stopLoadingText = progress.subscribe((p) => {
    loading.firstElementChild!.textContent = loadingText(p);
  });
  const s0 = settings.current;
  let quality: QualityLevel = resolveQuality(s0.graphics, s0.autoGraphics, window.innerWidth, window.innerHeight, window.devicePixelRatio);
  const renderer = new Renderer(root, QUALITY_PRESETS[quality]);
  let textures;
  try {
    textures = await scenery;
  } catch (err) {
    renderer.dispose();
    audio?.dispose();
    stopLoadingText();
    loading.remove();
    throw new Error(`Could not load the scenery photos: ${err instanceof Error ? err.message : String(err)}`);
  }
  // Never rejects: a jet whose model fails to load uses its generated model.
  const meshes = await aircraftMeshes;
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
    opponents: options.mission === 'free-flight' ? undefined : { count: 1, profile: DIFFICULTIES[options.difficulty] },
  });
  new SkySystem(renderer.scene, renderer.webgl, textures.sky);
  renderer.scene.add(new TerrainMesh(terrain, map, createTerrainMaterial(textures)).group);
  const sea = new Sea(textures.waterNormals);
  renderer.scene.add(sea.mesh);
  stopLoadingText();
  loading.remove();
  const sceneSync = new SceneSync(renderer.scene, (config) => aircraftModelFor(config, meshes));
  const targetModels = new GroundTargetModels(renderer.scene);
  const targetAlerts = new TargetAlerts();
  const strikeTeams = session.modeStatus().strike ?? null;
  const impactPoint = new Vector3();
  const effects = new Effects(renderer.scene);
  const cameraRig = new CameraRig(renderer.camera);
  const hud = new Hud(root);
  const input = new DomInput(renderer.webgl.domElement);
  input.attach();
  const mapper = new ControlMapper({ mode: options.controlMode });
  const pad = new GamepadReader();
  const governor = s0.graphics === 'auto' ? new QualityGovernor(quality) : null;

  const applyQuality = (level: QualityLevel) => {
    quality = level;
    const preset = QUALITY_PRESETS[level];
    renderer.setQuality(preset);
    effects.setParticleDensity(preset.particles);
    setSceneryAnisotropy(textures, preset.anisotropy);
  };
  /** Settings changed (or the match starts): apply everything that can change live. */
  const applySettings = (s: Readonly<Settings>) => {
    audio?.setVolume(s.volume);
    audio?.setMuted(!s.sound);
    if (mapper.settings.mode !== s.controlMode) {
      mapper.settings.mode = s.controlMode;
      const me = session.localView();
      if (me) mapper.resetAim(me.flight);
    }
    mapper.settings.mouseSensitivity = BASE_MOUSE_SENSITIVITY * s.mouseSensitivity;
    mapper.settings.invertY = s.invertY;
    mapper.settings.bindings = s.keys;
    input.captured = capturedKeys(s.keys);
    cameraRig.reduceMotion = s.reduceMotion;
    setHudColor(s.hudColor);
    hud.setScale(s.hudScale);
    if (s.graphics !== 'auto' && s.graphics !== quality) applyQuality(s.graphics);
  };
  applySettings(s0);
  applyQuality(quality);
  const stopSettings = settings.subscribe(applySettings);
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
  let hitTakenUntil = 0;
  let settingsOpen = false;
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
    onSettings: () => {
      settingsOpen = true;
      openSettings(root, settings, 'controls', () => {
        settingsOpen = false;
        // The Esc that closed the dialog must not also toggle the pause menu.
        input.snapshot();
      });
    },
    onQuit: () => {
      cleanup();
      handlers.onQuit();
    },
  });
  const openPause = () => {
    if (paused) return;
    paused = true;
    audio?.quiet();
    pause.show();
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
        hitTakenUntil = nowS + HIT_TAKEN_S;
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
    } else if (e.type === 'bombReleased') {
      if (e.aircraftId === session.localId) audio?.bombRelease();
    } else if (e.type === 'bombImpact') {
      const d = camPos.distanceTo(burst.set(e.x, e.y, e.z));
      audio?.explosion(explosionGain(d) * 0.8);
      if (d < EXPLOSION_SHAKE_RANGE_M) cameraRig.addTrauma(0.4 * (1 - d / EXPLOSION_SHAKE_RANGE_M));
    } else if (e.type === 'targetHit') {
      if (e.attackerId === session.localId) hitMarkerUntil = nowS + HIT_MARKER_S;
      const me = session.localView();
      if (me && strikeTeams && me.team === strikeTeams.defender) {
        const alert = targetAlerts.underAttack(e.targetId, nowS);
        if (alert) showBanner(alert, nowS);
      }
    } else if (e.type === 'targetDestroyed') {
      const text = targetDestroyedText(e.targetId);
      showBanner(text, nowS);
      if (strikeTeams) killFeed.add(text, strikeTeams.attacker, e.attackerId === session.localId);
    }
  };

  const endMatch = () => {
    matchOver = true;
    audio?.quiet();
    if (input.pointerLocked) document.exitPointerLock();
    const me = session.localView();
    const destroyed = session
      .groundTargets()
      .filter((t) => t.destroyed)
      .map((t) => `${t.id} (${t.label})`);
    const rows: ResultRow[] = [...session.views()]
      .map((v) => ({ callsign: v.callsign, aircraft: v.config.name, team: v.team, kills: v.kills, deaths: v.deaths, isLocal: v.isLocal }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    closeEndScreen = showEndScreen(root, matchResult(session.modeStatus(), me ? me.team : 'usa', destroyed), rows, {
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
    const padFrame = pad.read(pollGamepad(), settings.current.gamepad);
    if (padFrame.active) audio?.resume();
    if (governor && !paused && !matchOver) {
      const lower = governor.frame(dt);
      if (lower) {
        applyQuality(lower);
        settings.update({ autoGraphics: lower });
      }
    }
    if (!matchOver && !settingsOpen && mapper.pauseRequested(snap, padFrame)) {
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
      const controls = mapper.map(snap, me && me.alive ? me.flight : null, dt, padFrame);
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
    sceneSync.update(session.views(), nowS, renderer.camera.position);
    targetModels.update(session.groundTargets());
    renderer.webgl.getDrawingBufferSize(bufferSize);
    particleFrame.pixelScale = bufferSize.y / (2 * Math.tan((renderer.camera.fov * DEG) / 2));
    effects.update(active ? dt : 0, session, particleFrame, renderer.camera.position);
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
      const targets = session.groundTargets();
      const bombImpact = local.alive && local.stores.bombs > 0 ? predictImpact(f.pos, f.vel, BOMB_ANVIL, terrain, DT, impactPoint) : null;
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
        hint: local.bombLoad > 0 ? `${HINTS[mapper.settings.mode]} · G bomb` : HINTS[mapper.settings.mode],
        killFeed: killFeed.lines,
        hitMarker: nowS < hitMarkerUntil,
        hitTaken: nowS < hitTakenUntil,
        showScoreboard: mapper.scoresHeld(snap, padFrame) && !paused,
        dt,
        groundTargets: targets,
        bombImpact,
        releaseCue: releaseCue(bombImpact, targets),
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
    stopSettings();
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    root.removeEventListener('pointerdown', onPointerDown);
    input.detach();
    pause.dispose();
    closeEndScreen?.();
    hud.dispose();
    effects.dispose();
    sceneSync.dispose();
    targetModels.dispose();
    session.dispose();
    renderer.dispose();
    audio?.dispose();
  }
  return cleanup;
}
