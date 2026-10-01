import './ui/styles.css';
import { startGame } from './game.ts';
import { type AircraftMeshes, IMPORTED_MODELS, loadAircraftMeshes } from './render/aircraft-meshes.ts';
import { loadSceneryTextures, type SceneryTextures } from './render/assets.ts';
import { LoadProgress } from './render/load-progress.ts';
import { QUALITY_PRESETS, resolveQuality } from './render/quality.ts';
import { Renderer } from './render/renderer.ts';
import { Showcase } from './render/showcase.ts';
import { type LoadedMap, loadMap } from './render/terrain/map-loader.ts';
import { showLoadBar } from './ui/load-bar.ts';
import { type StartOptions, showStartMenu } from './ui/menu.ts';
import { SettingsStore } from './ui/settings.ts';

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element in index.html`);
  return el;
}

const app = requireElement('app');

function showError(message: string, title = 'Something went wrong', back?: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const panel = document.createElement('div');
  panel.className = 'panel narrow stack';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const text = document.createElement('p');
  text.className = 'notice';
  text.textContent = message;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  if (back) {
    button.textContent = 'Back to menu';
    button.addEventListener('click', () => {
      overlay.remove();
      back();
    });
  } else {
    button.textContent = 'Reload';
    button.addEventListener('click', () => location.reload());
  }
  panel.append(heading, text, button);
  overlay.appendChild(panel);
  app.appendChild(overlay);
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function run(scenery: Promise<SceneryTextures>, world: Promise<LoadedMap>, aircraftMeshes: Promise<AircraftMeshes>, settings: SettingsStore, progress: LoadProgress): void {
  const launch = (options: StartOptions): void => {
    startGame(app, options, { onQuit: showMenu, onRestart: launch }, scenery, aircraftMeshes, settings, progress).catch((err: unknown) => {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      // A refused or unreachable server is not a crash: go back and play offline or try another room.
      if (options.online) showError(message, 'Could not join the room', showMenu);
      else showError(message);
    });
  };

  function showMenu(): void {
    const s = settings.current;
    const quality = QUALITY_PRESETS[resolveQuality(s.graphics, s.autoGraphics, window.innerWidth, window.innerHeight, window.devicePixelRatio)];
    const showcase = new Showcase(app, scenery, world, aircraftMeshes, prefersReducedMotion(), quality);
    const close = showStartMenu(app, {
      onPreview: (id) => showcase.setAircraft(id),
      onWorld: (environment) => showcase.setEnvironment(environment),
      onStart: (options) => {
        close();
        showcase.dispose();
        launch(options);
      },
    }, settings);
  }

  showMenu();
}

if (Renderer.isWebGLAvailable()) {
  // Start decoding the scenery photos and the jet models, and generating Lechovia, now: the title screen shows them,
  // and the match reuses them.
  const progress = new LoadProgress();
  showLoadBar(app, progress);
  run(loadSceneryTextures(progress), loadMap('lechovia', progress), loadAircraftMeshes(IMPORTED_MODELS, progress), new SettingsStore(), progress);
} else {
  showError('WebGL is not available. Use a current desktop Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
}
