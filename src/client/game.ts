import { Color, Quaternion, Vector2, Vector3 } from 'three';
import { DIFFICULTIES } from '../shared/ai/difficulty.ts';
import { listAircraft } from '../shared/data/aircraft/registry.ts';
import type { MapId } from '../shared/data/maps/registry.ts';
import { BOMB_ANVIL, CANNONS } from '../shared/data/weapons.ts';
import { timeToImpact } from '../shared/map/ground-proximity.ts';
import { DEG } from '../shared/math/units.ts';
import { QUICK_CHAT } from '../shared/net/protocol.ts';
import type { GameMode } from '../shared/modes/mode.ts';
import { createMode } from '../shared/modes/registry.ts';
import { STRIKE_AIRCRAFT_PER_PILOT } from '../shared/modes/strike.ts';
import { atmosphere } from '../shared/physics/atmosphere.ts';
import { type ControlInput, neutralInput } from '../shared/physics/controls.ts';
import { predictImpact } from '../shared/weapons/bomb.ts';
import { leadDirection } from '../shared/weapons/lead.ts';
import type { DeathCause, GameEvent } from '../shared/world/events.ts';
import { DT } from '../shared/world/world.ts';
import { AudioEngine } from './audio/audio-engine.ts';
import { explosionGain, missileTone, nearestSources } from './audio/sound-mix.ts';
import { CameraRig, type CameraTarget } from './camera/camera-rig.ts';
import { DeathCam, killcamFov, killcamPosition } from './camera/death-cam.ts';
import { Hud } from './hud/hud.ts';
import { describeDeath, KillFeed } from './hud/kill-feed.ts';
import { setHudColor } from './hud/palette.ts';
import { releaseCue, TargetAlerts, targetDestroyedText } from './hud/strike-hud.ts';
import { formatTimeOfDay } from './hud/format.ts';
import { sentinelDownText, zoneEventText, zoneFeedText } from './hud/objective-hud.ts';
import { takeoffHint } from './hud/takeoff.ts';
import { trainingPrompt } from './hud/training-prompts.ts';
import { BASE_MOUSE_SENSITIVITY, ControlMapper, type ControlMode } from './input/control-mapper.ts';
import { keyLabel } from './input/bindings.ts';
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
import { type LoadedMap, loadMap } from './render/terrain/map-loader.ts';
import { TerrainLod } from './render/terrain/terrain-lod.ts';
import { WorldFeatures } from './render/world/world-features.ts';
import { Environment } from './render/environment/environment.ts';
import { createTerrainMaterial } from './render/terrain-material.ts';
import { TrainingRings } from './render/training-rings.ts';
import { CHAT_KEYS, ConnectionOverlay, connectOnline, DebugOverlay, isOutdated, RECONNECT_DELAYS_MS, reportErrors, showUpdateNotice } from './online-play.ts';
import type { GameSession } from './session/game-session.ts';
import { LocalSession } from './session/local-session.ts';
import type { NetworkSession } from './session/network-session.ts';
import { matchResult, type ResultRow, showEndScreen } from './ui/end-screen.ts';
import { MapScreen } from './ui/map-screen.ts';
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

/** The offline mode for the title screen's choices: Strike gives each side four aircraft per pilot (M5). */
function modeFor(options: StartOptions): GameMode {
  const size = Math.max(1, options.teamSize ?? 1);
  return createMode(options.mission, { strike: { aircraftPerTeam: STRIKE_AIRCRAFT_PER_PILOT * size } });
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
  // Offline the map is the player's choice (Strike and Training keep the Test Range); online the room decides it and
  // the page builds whichever map the welcome names.
  const mapId: MapId = options.mission === 'strike' || options.mission === 'training' ? 'test-range' : (options.map ?? 'lechovia');
  const fail = (err: unknown, prefix = '') => {
    renderer.dispose();
    audio?.dispose();
    stopLoadingText();
    loading.remove();
    return new Error(`${prefix}${err instanceof Error ? err.message : String(err)}`);
  };
  /** the server connection in online play (M2), otherwise null */
  let online: NetworkSession | null = null;
  let loadedMap: LoadedMap;
  if (options.online) {
    stopLoadingText();
    loading.firstElementChild!.textContent = 'Connecting to the game server…';
    try {
      online = await connectOnline(options, (id) => loadMap(id, progress));
      loadedMap = await loadMap(online.map.id as MapId);
    } catch (err) {
      throw fail(err);
    }
  } else {
    try {
      loadedMap = await loadMap(mapId, progress);
    } catch (err) {
      throw fail(err, 'Could not build the map: ');
    }
  }
  const map = loadedMap.def;
  const terrain = loadedMap.terrain;
  const teamSize = Math.max(1, options.teamSize ?? 1);
  // Online the room's mode decides the respawn delay shown while waiting.
  const mode = online ? createMode(online.modeId) : modeFor(options);
  let session: GameSession;
  if (online) {
    session = online;
  } else {
    session = new LocalSession({
      map,
      terrain,
      mode,
      aircraftId: options.aircraftId,
      callsign: options.callsign,
      // A fresh seed per match varies gunfire spread, flare luck and the bot's aim; the World stays deterministic.
      seed: Math.floor(Math.random() * 0x7fffffff),
      // Training brings its own drones; Free Flight has no enemies.
      opponents: options.mission === 'free-flight' || options.mission === 'training' ? undefined : { count: teamSize, profile: DIFFICULTIES[options.difficulty] },
      wingmen: options.mission === 'free-flight' || options.mission === 'training' || teamSize < 2 ? undefined : { count: teamSize - 1, profile: DIFFICULTIES[options.difficulty] },
      start: options.start,
      // Training flies a calm noon.
      environment: options.mission === 'training' ? undefined : options.environment,
    });
  }
  const ground = new TerrainLod(loadedMap, createTerrainMaterial(textures), QUALITY_PRESETS[quality].terrainDetail);
  renderer.scene.add(ground.group);
  const worldFeatures = new WorldFeatures(map, terrain);
  renderer.scene.add(worldFeatures.group);
  const environment = new Environment(renderer.scene, renderer.webgl, session.environment, map.seed, {
    cloudRangeM: QUALITY_PRESETS[quality].cloudRangeM,
    pixelRatio: renderer.webgl.getPixelRatio(),
    lights: { city: worldFeatures.cityLights, runway: worldFeatures.runwayLights },
  });
  const sea = new Sea(textures.waterNormals);
  renderer.scene.add(sea.mesh);
  // Build the ground around the start before the first frame.
  const startView = session.localView();
  if (startView) await ground.prepare(startView.position);
  stopLoadingText();
  loading.remove();
  const sceneSync = new SceneSync(renderer.scene, (config) => aircraftModelFor(config, meshes));
  const targetModels = new GroundTargetModels(renderer.scene);
  const trainingRings = new TrainingRings(renderer.scene);
  const targetAlerts = new TargetAlerts();
  // Online, the mode status arrives from the server after the first frames: read it when needed.
  const strikeTeams = () => session.modeStatus().strike ?? null;
  const impactPoint = new Vector3();
  const effects = new Effects(renderer.scene, { terrain, wreckModel: (id) => sceneSync.modelFor(id)?.root ?? null });
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
    ground.splitFactor = preset.terrainDetail;
    environment.cloudRangeM = preset.cloudRangeM;
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
  const mapScreen = new MapScreen(root, map, terrain);
  const particleFrame: ParticleFrame = { pixelScale: 1000, fogColor: new Color(), fogDensity: 0 };
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
  // Online (M2): the line can drop and come back; the match never pauses.
  // The debug readout goes in first so every dialog covers it.
  const debug = new URLSearchParams(location.search).get('debug') === '1' ? new DebugOverlay(root) : null;
  const connection = online ? new ConnectionOverlay(root) : null;
  let closeUpdateNotice: (() => void) | null = online && isOutdated(__BUILD_ID__, online.serverBuild) ? showUpdateNotice(root) : null;
  const stopErrorReports = online ? reportErrors(__BUILD_ID__) : null;
  /** the line dropped: the connection overlay is up */
  let lineDown = false;
  let reconnecting = false;
  const idle: ControlInput = neutralInput(0.8);
  let closeEndScreen: (() => void) | null = null;
  const attachOnline = (s: NetworkSession) => {
    online = s;
    session = s;
    s.onClosed = (reason, clean) => {
      if (running && !clean) void reconnect(reason);
    };
  };
  /** Tries again after 1, 2 and 4 s, then offers Reconnect / Main menu (spec §17). The room keeps flying meanwhile. */
  const reconnect = async (reason: string) => {
    if (reconnecting) return;
    reconnecting = true;
    lineDown = true;
    if (input.pointerLocked) document.exitPointerLock();
    for (let i = 0; i < RECONNECT_DELAYS_MS.length; i++) {
      connection?.show(`${reason}. Reconnecting (try ${i + 1} of ${RECONNECT_DELAYS_MS.length})…`);
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAYS_MS[i]));
      if (!running) return;
      try {
        const next = await connectOnline(options, (id) => loadMap(id, progress));
        if (!running) {
          next.dispose();
          return;
        }
        // A room made again after a server restart could fly elsewhere: this page's scenery is for the old map.
        if (next.map.id !== map.id) {
          next.dispose();
          throw new Error(`The room now flies on ${next.map.name}`);
        }
        session.dispose();
        attachOnline(next);
        // The server may have restarted with a new version.
        if (!closeUpdateNotice && isOutdated(__BUILD_ID__, next.serverBuild)) closeUpdateNotice = showUpdateNotice(root);
        closeEndScreen?.();
        closeEndScreen = null;
        matchOver = false;
        spawnGen = -1;
        deathMessage = null;
        killFeed.clear();
        connection?.hide();
        reconnecting = false;
        lineDown = false;
        input.requestPointerLock();
        return;
      } catch (err) {
        reason = err instanceof Error ? err.message.replace(/\.$/, '') : String(err);
      }
    }
    reconnecting = false;
    connection?.show(`${reason}.`, [
      ['Reconnect', () => void reconnect(reason)],
      [
        'Main menu',
        () => {
          cleanup();
          handlers.onQuit();
        },
      ],
    ]);
  };
  if (online) attachOnline(online);
  const target: CameraTarget = {
    position: new Vector3(),
    quaternion: new Quaternion(),
    gLoad: 1,
    mach: 0,
    throttle: 0,
    lookYaw: 0,
    lookPitch: 0,
  };
  // While waiting to respawn (M5): the kill cam, then spectating; and the jet to fly next.
  const deathCam = new DeathCam();
  const watchTarget: CameraTarget = { ...target, position: new Vector3(), quaternion: new Quaternion() };
  const watchAim = new Vector3();
  const killcamAt = new Vector3();
  let nextJet: string | null = null;
  let lastGear = 0;
  const listenerVel = new Vector3();
  const lastListener = new Vector3();
  const forward = new Vector3();
  const upward = new Vector3();
  const canChangeJet = options.mission !== 'training';

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
  }, { note: online ? 'Online, the match keeps going: your jet flies straight on.' : undefined });
  const openPause = () => {
    if (paused) return;
    paused = true;
    audio?.quiet();
    pause.show();
  };
  // Browsers swallow Esc while the pointer is locked and release the lock instead: treat that as "pause".
  const onPointerLockChange = () => {
    if (running && !matchOver && !lineDown && !input.pointerLocked && !paused) openPause();
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
        audio?.explosionAt(victim.position, explosionGain(d));
        if (d < EXPLOSION_SHAKE_RANGE_M) cameraRig.addTrauma(0.6 * (1 - d / EXPLOSION_SHAKE_RANGE_M));
      }
      const me = session.localView();
      if (e.aircraftId === session.localId) {
        deathMessage = deathText(e.cause, killer?.callsign ?? null);
        respawnAt = nowS + mode.respawnDelayS;
        if (victim) {
          deathCam.start(victim.position, killer && killer.id !== victim.id ? killer.id : null);
          nextJet = victim.config.id;
        }
      } else if (victim?.config.support && me) {
        showBanner(sentinelDownText(victim.team, me.team), nowS);
        audio?.sentinelDown(victim.team === me.team);
      } else if (killer?.isLocal) {
        showBanner('TARGET DESTROYED', nowS);
        audio?.killConfirmed();
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
      audio?.explosionAt(burst, explosionGain(d) * 0.6);
      if (d < EXPLOSION_SHAKE_RANGE_M) cameraRig.addTrauma(0.4 * (1 - d / EXPLOSION_SHAKE_RANGE_M));
    } else if (e.type === 'missileDecoyed') {
      if (e.targetId === session.localId) showBanner('MISSILE DECOYED', nowS);
    } else if (e.type === 'countermeasures') {
      if (e.aircraftId === session.localId) audio?.flare();
    } else if (e.type === 'bombReleased') {
      if (e.aircraftId === session.localId) audio?.bombRelease();
    } else if (e.type === 'bombImpact') {
      const d = camPos.distanceTo(burst.set(e.x, e.y, e.z));
      audio?.explosionAt(burst, explosionGain(d) * 0.8);
      if (d < EXPLOSION_SHAKE_RANGE_M) cameraRig.addTrauma(0.4 * (1 - d / EXPLOSION_SHAKE_RANGE_M));
    } else if (e.type === 'targetHit') {
      if (e.attackerId === session.localId) hitMarkerUntil = nowS + HIT_MARKER_S;
      const me = session.localView();
      const teams = strikeTeams();
      if (me && teams && me.team === teams.defender) {
        const alert = targetAlerts.underAttack(e.targetId, nowS);
        if (alert) showBanner(alert, nowS);
      }
    } else if (e.type === 'zone') {
      const me = session.localView();
      if (me) {
        showBanner(zoneEventText(e.zoneId, e.owner, e.previous, me.team), nowS);
        audio?.zoneChanged(e.owner === me.team || (e.owner === null && e.previous !== me.team));
        killFeed.add(zoneFeedText(e.zoneId, e.owner, e.previous), e.owner ?? e.previous ?? me.team, false);
      }
    } else if (e.type === 'targetDestroyed') {
      const text = targetDestroyedText(e.targetId);
      showBanner(text, nowS);
      const teams = strikeTeams();
      if (teams) killFeed.add(text, teams.attacker, e.attackerId === session.localId);
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
      .filter((v) => !v.config.support)
      .map((v) => ({ callsign: v.callsign, aircraft: v.config.name, team: v.team, kills: v.kills, deaths: v.deaths, isLocal: v.isLocal }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const training = options.mission === 'training';
    if (training) settings.update({ trainingDone: true });
    const final = session.modeStatus();
    const result = matchResult(final, me ? me.team : 'usa', destroyed);
    audio?.matchEnd(training || (me && final.winner === me.team) ? 'win' : final.winner === 'draw' ? 'draw' : 'loss');
    if (online) result.note = [result.note, 'The next match in this room starts in a few seconds.'].filter(Boolean).join(' ');
    closeEndScreen = showEndScreen(root, result, rows, {
      againLabel: online ? 'Stay for the next match' : training ? 'Fly a dogfight' : undefined,
      onAgain: () => {
        if (online) {
          // The room restarts on its own; just get the results out of the way.
          closeEndScreen?.();
          closeEndScreen = null;
          return;
        }
        cleanup();
        handlers.onRestart(training ? { ...options, mission: 'team-deathmatch' } : options);
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
    const frameS = (now - last) / 1000;
    const dt = Math.min(frameS, 0.1);
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
    if (!paused && !matchOver && !settingsOpen && mapper.mapToggled(snap)) mapScreen.toggle();
    if (!matchOver && !settingsOpen && !lineDown && mapper.pauseRequested(snap, padFrame)) {
      if (paused) {
        pause.hide();
        paused = false;
      } else {
        openPause();
      }
    }

    const active = !paused && !matchOver;
    if (online && online.consumeMatchStart()) {
      // The room started its next match: new jets, fresh scores.
      closeEndScreen?.();
      closeEndScreen = null;
      matchOver = false;
      spawnGen = -1;
      deathMessage = null;
      killFeed.clear();
      input.requestPointerLock();
    }
    if (active || online) {
      const me = session.localView();
      if (me && me.spawnGen !== spawnGen) {
        spawnGen = me.spawnGen;
        mapper.resetAim(me.flight);
        cameraRig.reset();
        hud.resetMaxG();
        deathMessage = null;
        deathCam.stop();
        nextJet = null;
        audio?.respawn();
        if (me.flight.onGround) showBanner('CLEARED FOR TAKE-OFF', nowS);
      }
      // The gear motor runs as the wheels start to come up.
      if (me && me.alive && me.flight.gear < 1 && lastGear >= 1) audio?.gearMotor();
      lastGear = me?.flight.gear ?? 0;
      // Online the jet keeps flying while the menu is open: hold the throttle, centre the stick.
      if (!active && me) idle.throttle = me.flight.throttle;
      const controls = active ? mapper.map(snap, me && me.alive ? me.flight : null, dt, padFrame) : idle;
      // Online a slow frame still has to send every input the server's clock asks for (down to 4 fps).
      session.update(online ? Math.min(frameS, 0.25) : dt, controls);
      for (const e of session.drainEvents()) handleEvent(e, nowS);
      if (online) {
        if (active) CHAT_KEYS.forEach((code, i) => snap.pressed.has(code) && online?.sendChat(i));
        for (const c of online.drainChat()) {
          const from = session.view(c.from);
          killFeed.add(`${from?.callsign ?? 'Someone'}: ${QUICK_CHAT[c.index] ?? ''}`, from?.team ?? 'usa', c.from === session.localId);
        }
      }
      killFeed.update(dt);
      const meNow = session.localView();
      if (meNow && !meNow.alive && deathCam.phase !== 'off') {
        deathCam.update(dt, session.views(), meNow.team);
        if (active) {
          const c = mapper.deathControls(snap, padFrame.active ? padFrame : null);
          if (c.watch !== 0) {
            deathCam.cycle(session.views(), meNow.team, c.watch);
            cameraRig.reset();
          }
          if (c.jet !== 0 && canChangeJet) {
            const jets = listAircraft(meNow.team);
            const i = jets.findIndex((j) => j.id === (nextJet ?? meNow.config.id));
            nextJet = jets[(i + c.jet + jets.length) % jets.length].id;
            session.chooseNextJet(nextJet);
          }
        }
      }
      if (!matchOver && session.modeStatus().winner !== null) endMatch();
    }
    if (debug) {
      const f = session.localView()?.flight;
      const lines = f
        ? [
            `a ${(f.alpha / DEG).toFixed(1)}  n ${f.gLoad.toFixed(1)}  M ${f.mach.toFixed(2)}`,
            `alt ${f.pos.y.toFixed(0)} m  gear ${f.gear.toFixed(2)}${f.onGround ? '  wheels' : ''}  ${formatTimeOfDay(session.hour())}`,
          ]
        : [];
      if (online) lines.push(`RTT ${online.rttMs.toFixed(0)} ms  queue ${online.queueDepth}`, `prediction error ${online.predictionErrorM.toFixed(2)} m`);
      debug.frame(now, lines);
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
    const watched = local && !local.alive && deathCam.phase === 'spectate' && deathCam.watchingId !== null ? session.view(deathCam.watchingId) : null;
    if (local && !local.alive && deathCam.phase === 'killcam') {
      const killer = deathCam.killerId === null ? null : session.view(deathCam.killerId);
      const k = killer && killer.alive ? killer : null;
      killcamPosition(deathCam.wreck, k ? k.position : null, killcamAt);
      // Reduce motion: the shot cuts in instead of easing over.
      cameraRig.frame(killcamAt, k ? k.position : deathCam.wreck, k ? killcamFov(killcamAt.distanceTo(k.position)) : 60, settings.current.reduceMotion ? 0 : dt);
    } else if (watched && watched.alive) {
      watchTarget.position.copy(watched.position);
      watchTarget.quaternion.copy(watched.quaternion);
      watchTarget.mach = 0;
      watchTarget.gLoad = 1;
      watchTarget.throttle = 0;
      // Level with the horizon, along the watched jet's flight path.
      const v = watched.flight.vel;
      cameraRig.update(dt, watchTarget, v.lengthSq() > 1 ? watchAim.copy(v).normalize() : null);
    } else {
      cameraRig.update(active ? dt : 0, local ? target : null, aim);
    }
    ground.update(renderer.camera.position);
    worldFeatures.update(renderer.camera.position);
    environment.update(session.hour(), renderer.camera, active ? dt : 0);
    particleFrame.fogColor.copy(environment.fog.color);
    particleFrame.fogDensity = environment.fog.density;
    hud.setNight(environment.night);
    sceneSync.update(session.views(), nowS, renderer.camera.position);
    targetModels.update(session.groundTargets());
    trainingRings.update(session.modeStatus().training?.ring, renderer.camera.position);
    renderer.webgl.getDrawingBufferSize(bufferSize);
    particleFrame.pixelScale = bufferSize.y / (2 * Math.tan((renderer.camera.fov * DEG) / 2));
    effects.update(active ? dt : 0, session, particleFrame, renderer.camera.position, 1 - 0.85 * environment.night);
    for (const p of effects.drainImpacts()) audio?.explosionAt(p, explosionGain(p.distanceTo(renderer.camera.position)) * 0.7);
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
      const deathInfo: string[] = [];
      if (message && !local.alive) {
        const keys = settings.current.keys;
        const pad = padFrame.active;
        if (deathCam.phase === 'killcam' && deathCam.killerId !== null) {
          const k = session.view(deathCam.killerId);
          if (k) deathInfo.push(`${k.callsign} · ${k.config.name} · ${Math.round((100 * k.hp) / k.config.damage.hitPoints)}% HP left`);
        } else if (watched) {
          deathInfo.push(`WATCHING ${watched.callsign} · ${watched.config.name}   ${pad ? 'stick' : `${keyLabel(keys.rollLeft[0])} / ${keyLabel(keys.rollRight[0])}`} to switch`);
        }
        if (canChangeJet && nextJet) {
          const name = listAircraft(local.team).find((j) => j.id === nextJet)?.name ?? '';
          deathInfo.push(`NEXT JET  ◀ ${pad ? 'LB' : keyLabel(keys.yawLeft[0])}  ${name.toUpperCase()}  ${pad ? 'RB' : keyLabel(keys.yawRight[0])} ▶`);
        }
      }
      const targets = session.groundTargets();
      const status = session.modeStatus();
      const bombImpact = local.alive && local.stores.bombs > 0 ? predictImpact(f.pos, f.vel, BOMB_ANVIL, terrain, DT, impactPoint) : null;
      // Not on the take-off run: the gear is down until the jet is well clear of the runway.
      const pullUp = local.alive && f.gear === 0 && timeToImpact(f, terrain) !== null;
      hud.draw({
        view: local,
        weapon: mapper.selectedWeapon,
        views: [...session.views()],
        missiles: [...session.missiles()],
        target: targetView,
        leadDirection: leadDir,
        camera: renderer.camera,
        aimDirection: aim,
        status,
        radarAltitudeM: f.pos.y - terrain.surfaceAt(f.pos.x, f.pos.z),
        pullUp,
        message,
        deathInfo,
        banner: nowS < bannerUntil ? banner : null,
        hint:
          local.alive && f.onGround
            ? takeoffHint(mapper.settings.mode, local.config.hudUnits, settings.current.keys, padFrame.active)
            : `${HINTS[mapper.settings.mode]}${local.bombLoad > 0 ? ' · G bomb' : ''}${online ? ' · 7-0 chat' : ''}`,
        killFeed: killFeed.lines,
        hitMarker: nowS < hitMarkerUntil,
        hitTaken: nowS < hitTakenUntil,
        showScoreboard: mapper.scoresHeld(snap, padFrame) && !paused,
        dt,
        groundTargets: targets,
        bombImpact,
        releaseCue: releaseCue(bombImpact, targets),
        training: status.training ? trainingPrompt(status.training, settings.current.keys, mapper.settings.mode, padFrame.active) : null,
        localTime: formatTimeOfDay(session.hour()),
      });
      if (audio && active) {
        const cam = renderer.camera;
        if (dt > 0) listenerVel.subVectors(cam.position, lastListener).divideScalar(dt);
        lastListener.copy(cam.position);
        const near = (pos: Vector3, vel: Vector3, throttle: number, id: number) => ({ id, pos, vel, throttle });
        audio.update({
          alive: local.alive,
          throttle: f.throttle,
          airspeedMs: f.airspeed,
          seeker: missileTone(local.seeker.mode, local.radarLock.mode),
          missileWarning: local.incoming !== null,
          rwrLock: local.lockedByRadar,
          firingCannon: local.firingCannon,
          cannonRateHz: CANNONS[local.config.stores.cannon].projectilesPerS,
          timeS: nowS,
          stall: local.alive && !f.onGround && f.alpha > local.config.physics.alphaMaxDeg * DEG,
          pullUp,
          rollingMs: local.alive && f.onGround ? f.airspeed : 0,
          rain: environment.raining,
          listener: { pos: cam.position, forward: forward.set(0, 0, -1).applyQuaternion(cam.quaternion), up: upward.set(0, 1, 0).applyQuaternion(cam.quaternion), vel: listenerVel },
          jets: nearestSources(
            [...session.views()].filter((v) => v.alive && !v.isLocal).map((v) => near(v.position, v.flight.vel, v.flight.throttle, v.id)),
            cam.position,
            2,
            2500,
          ),
          missiles: nearestSources(
            [...session.missiles()].map((m) => near(m.position, m.velocity, 1, m.id)),
            cam.position,
            1,
            700,
          ),
        });
      }
    } else {
      hud.draw(null);
    }
    mapScreen.draw(session.localView(), session.views(), session.groundTargets(), session.modeStatus());
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
  input.requestPointerLock();

  function cleanup(): void {
    running = false;
    cancelAnimationFrame(rafId);
    stopSettings();
    connection?.dispose();
    debug?.dispose();
    closeUpdateNotice?.();
    closeUpdateNotice = null;
    stopErrorReports?.();
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    root.removeEventListener('pointerdown', onPointerDown);
    input.detach();
    pause.dispose();
    closeEndScreen?.();
    hud.dispose();
    mapScreen.dispose();
    effects.dispose();
    sceneSync.dispose();
    targetModels.dispose();
    trainingRings.dispose();
    ground.dispose();
    worldFeatures.dispose();
    environment.dispose();
    session.dispose();
    renderer.dispose();
    audio?.dispose();
  }
  return cleanup;
}
