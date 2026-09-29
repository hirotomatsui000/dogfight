import './ui/styles.css';
import { startGame } from './game.ts';
import { Renderer } from './render/renderer.ts';
import { showStartMenu } from './ui/menu.ts';

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

function showMenu(): void {
  const close = showStartMenu(app, (options) => {
    close();
    startGame(app, options, showMenu).catch((err: unknown) => {
      console.error(err);
      showError(err instanceof Error ? err.message : String(err));
    });
  });
}

if (Renderer.isWebGLAvailable()) {
  showMenu();
} else {
  showError('WebGL is not available. Use a current desktop Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
}
