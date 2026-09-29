import { Quaternion, Vector3 } from 'three';
import { buildTerrain } from '../shared/data/maps/map-definition.ts';
import { createTestRange } from '../shared/data/maps/test-range.ts';
import { timeToImpact } from '../shared/map/ground-proximity.ts';
import { FreeFlightMode } from '../shared/modes/free-flight.ts';
import { CameraRig, type CameraTarget, type FreeCamInput, NO_FREE_INPUT, pilotEyeOffset } from './camera/camera-rig.ts';
import { Hud } from './hud/hud.ts';
import { ControlMapper, type ControlMode } from './input/control-mapper.ts';
import { DomInput } from './input/dom-input.ts';
import { loadSceneryTextures } from './render/assets.ts';
import { Renderer } from './render/renderer.ts';
import { SceneSync } from './render/scene-sync.ts';
import { Sea } from './render/sea.ts';
import { SkySystem } from './render/sky.ts';
import { createTerrainMaterial } from './render/terrain-material.ts';
import { TerrainMesh } from './render/terrain-mesh.ts';
import { LocalSession } from './session/local-session.ts';
import type { StartOptions } from './ui/menu.ts';
import { PauseMenu } from './ui/pause.ts';
import { loadSetting, saveSetting } from './ui/storage.ts';

const FREE_CAM_KEY_TURN_RAD_S = 1.2;

const HINTS: Record<ControlMode | 'free', string> = {
  'mouse-aim': 'MOUSE aim · W/S A/D Q/E override · SHIFT/Z throttle · B airbrake · C look · V camera · P pause',
  direct: 'W/S pitch · A/D roll · Q/E rudder · SHIFT/Z throttle · B airbrake · C+mouse look · V camera · P pause',
  free: 'FREE CAMERA · W/A/S/D move · Q/E down/up · SHIFT fast · mouse or arrow keys look · V next camera',
};

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

/** Builds a local single-player game in `root` once the scenery photos are loaded. Resolves to a cleanup function. */
export async function startGame(root: HTMLElement, options: StartOptions, onQuit: () => void): Promise<() => void> {
  const loading = showLoading(root, 'Loading scenery…');
  const renderer = new Renderer(root);
  let textures;
  try {
    textures = await loadSceneryTextures(renderer.webgl.capabilities.getMaxAnisotropy());
  } catch (err) {
    renderer.dispose();
    loading.remove();
    throw new Error(`Could not load the scenery photos: ${err instanceof Error ? err.message : String(err)}`);
  }
  const map = createTestRange(1);
  const terrain = buildTerrain(map);
  const mode = new FreeFlightMode();
  const session = new LocalSession({ map, terrain, mode, aircraftId: options.aircraftId, callsign: options.callsign });
  new SkySystem(renderer.scene, renderer.webgl, textures.sky);
  renderer.scene.add(new TerrainMesh(terrain, map, createTerrainMaterial(textures)).group);
  const sea = new Sea(textures.waterNormals);
  renderer.scene.add(sea.mesh);
  loading.remove();
  const sceneSync = new SceneSync(renderer.scene);
  const cameraRig = new CameraRig(renderer.camera);
  cameraRig.reduceMotion = loadSetting('reduceMotion', false);
  const hud = new Hud(root);
  const input = new DomInput(renderer.webgl.domElement);
  input.attach();
  const mapper = new ControlMapper({ mode: options.controlMode });

  let paused = false;
  let running = true;
  let rafId = 0;
  let last = performance.now();
  let spawnGen = -1;
  let deathMessage: string | null = null;
  let respawnAt = 0;
  const target: CameraTarget = {
    position: new Vector3(),
    quaternion: new Quaternion(),
    gLoad: 1,
    mach: 0,
    throttle: 0,
    eyeOffset: new Vector3(),
    lookYaw: 0,
    lookPitch: 0,
  };
  const free: FreeCamInput = { ...NO_FREE_INPUT };

  const pause = new PauseMenu(root, {
    onResume: () => {
      pause.hide();
      paused = false;
      last = performance.now();
      input.requestPointerLock();
    },
    onQuit: () => {
      cleanup();
      onQuit();
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
  });
  const openPause = () => {
    if (paused) return;
    paused = true;
    pause.show({ controlMode: mapper.settings.mode, reduceMotion: cameraRig.reduceMotion });
  };
  // Browsers swallow Esc while the pointer is locked and release the lock instead: treat that as "pause".
  const onPointerLockChange = () => {
    if (running && !input.pointerLocked && !paused) openPause();
  };
  document.addEventListener('pointerlockchange', onPointerLockChange);

  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const snap = input.snapshot();
    if (snap.pressed.has('KeyP') || snap.pressed.has('Escape')) {
      if (paused) {
        pause.hide();
        paused = false;
      } else {
        openPause();
      }
    }

    if (!paused) {
      if (snap.pressed.has('KeyV')) cameraRig.cycle();
      const me = session.localView();
      if (me && me.spawnGen !== spawnGen) {
        spawnGen = me.spawnGen;
        mapper.resetAim(me.flight);
        hud.resetMaxG();
        deathMessage = null;
      }
      const controls = mapper.map(snap, me && me.alive ? me.flight : null, dt, cameraRig.mode === 'free');
      session.update(dt, controls);
      for (const e of session.drainEvents()) {
        if (e.type === 'destroyed' && e.aircraftId === session.localId) {
          deathMessage = e.cause === 'boundary' ? 'LEFT THE COMBAT AREA' : 'CRASHED';
          respawnAt = now / 1000 + mode.respawnDelayS;
        }
      }
    }

    const local = session.localView();
    if (local) {
      if (local.alive) {
        target.position.copy(local.position);
        target.quaternion.copy(local.quaternion);
        target.gLoad = local.flight.gLoad;
        target.mach = local.flight.mach;
        target.throttle = local.flight.throttle;
        pilotEyeOffset(local.config.visual, target.eyeOffset);
      } else {
        target.gLoad = 1;
        target.mach = 0;
        target.throttle = 0;
      }
      target.lookYaw = mapper.lookYaw;
      target.lookPitch = mapper.lookPitch;
    }
    if (cameraRig.mode === 'free' && !paused) {
      const k = snap.keys;
      free.forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      free.right = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      free.up = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
      free.fast = k.has('ShiftLeft') || k.has('ShiftRight');
      // Arrow keys turn the free camera too, for trackpads and when the browser refuses mouse capture.
      const arrowYaw = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
      const arrowPitch = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
      free.yawDelta = snap.mouseDX * mapper.settings.mouseSensitivity + arrowYaw * FREE_CAM_KEY_TURN_RAD_S * dt;
      free.pitchDelta = -snap.mouseDY * mapper.settings.mouseSensitivity + arrowPitch * FREE_CAM_KEY_TURN_RAD_S * dt;
    } else {
      Object.assign(free, NO_FREE_INPUT);
    }
    const aim = mapper.settings.mode === 'mouse-aim' ? mapper.aimDirection : null;
    cameraRig.update(paused ? 0 : dt, local ? target : null, aim, free);
    sceneSync.update(session.views(), cameraRig.mode === 'hud', now / 1000);
    sea.update(now / 1000);
    renderer.render();

    if (local) {
      const f = local.flight;
      const message = paused || !deathMessage ? null : `${deathMessage} — RESPAWN IN ${Math.max(0, Math.ceil(respawnAt - now / 1000))}`;
      hud.draw({
        view: local,
        camera: renderer.camera,
        cameraMode: cameraRig.mode,
        aimDirection: cameraRig.mode === 'free' ? null : aim,
        modeLabel: session.modeStatus().label,
        radarAltitudeM: f.pos.y - terrain.surfaceAt(f.pos.x, f.pos.z),
        pullUp: local.alive && timeToImpact(f, terrain) !== null,
        message,
        hint: HINTS[cameraRig.mode === 'free' ? 'free' : mapper.settings.mode],
        dt,
      });
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
    input.detach();
    pause.dispose();
    hud.dispose();
    sceneSync.dispose();
    session.dispose();
    renderer.dispose();
  }
  return cleanup;
}
