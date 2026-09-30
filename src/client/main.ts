import './ui/styles.css';
import { startGame } from './game.ts';
import { loadSceneryTextures, type SceneryTextures } from './render/assets.ts';
import { Renderer } from './render/renderer.ts';
import { Showcase } from './render/showcase.ts';
import { type StartOptions, showStartMenu } from './ui/menu.ts';

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element in index.html`);
  return el;
}

const app = requireElement('app');

function showError(message: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const panel = document.createElement('div');
  panel.className = 'panel narrow stack';
  const title = document.createElement('h2');
  title.textContent = 'Something went wrong';
  const text = document.createElement('p');
  text.className = 'notice';
  text.textContent = message;
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'button';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => location.reload());
  panel.append(title, text, reload);
  overlay.appendChild(panel);
  app.appendChild(overlay);
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function run(scenery: Promise<SceneryTextures>): void {
  const launch = (options: StartOptions): void => {
    startGame(app, options, { onQuit: showMenu, onRestart: launch }, scenery).catch((err: unknown) => {
      console.error(err);
      showError(err instanceof Error ? err.message : String(err));
    });
  };

  function showMenu(): void {
    const showcase = new Showcase(app, scenery, prefersReducedMotion());
    const close = showStartMenu(app, {
      onPreview: (id) => showcase.setAircraft(id),
      onStart: (options) => {
        close();
        showcase.dispose();
        launch(options);
      },
    });
  }

  showMenu();
}

if (Renderer.isWebGLAvailable()) {
  // Start decoding the scenery photos now: the title screen shows them, and the match reuses them.
  run(loadSceneryTextures());
} else {
  showError('WebGL is not available. Use a current desktop Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
}
