import type { ControlMode } from '../input/control-mapper.ts';

export interface PauseState {
  controlMode: ControlMode;
  reduceMotion: boolean;
}

export interface PauseHandlers {
  onResume(): void;
  onQuit(): void;
  onToggleControlMode(): ControlMode;
  onToggleReduceMotion(): boolean;
}

const controlText = (m: ControlMode) => `Controls: ${m === 'mouse-aim' ? 'Mouse aim' : 'Keyboard direct'}`;
const motionText = (on: boolean) => `Camera shake: ${on ? 'Reduced' : 'Full'}`;

export class PauseMenu {
  private readonly overlay = document.createElement('div');
  private readonly controlButton = document.createElement('button');
  private readonly motionButton = document.createElement('button');

  constructor(root: HTMLElement, handlers: PauseHandlers) {
    this.overlay.className = 'overlay translucent';
    this.overlay.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'panel narrow stack';
    const title = document.createElement('h2');
    title.textContent = 'Paused';
    title.style.margin = '0 0 8px';
    const resume = this.button('Resume', 'button', () => handlers.onResume());
    this.controlButton.type = 'button';
    this.controlButton.className = 'button secondary';
    this.controlButton.addEventListener('click', () => {
      this.controlButton.textContent = controlText(handlers.onToggleControlMode());
    });
    this.motionButton.type = 'button';
    this.motionButton.className = 'button secondary';
    this.motionButton.addEventListener('click', () => {
      this.motionButton.textContent = motionText(handlers.onToggleReduceMotion());
    });
    const quit = this.button('Quit to menu', 'button secondary', () => handlers.onQuit());
    panel.append(title, resume, this.controlButton, this.motionButton, quit);
    this.overlay.appendChild(panel);
    root.appendChild(this.overlay);
  }

  get visible(): boolean {
    return !this.overlay.hidden;
  }

  show(state: PauseState): void {
    this.controlButton.textContent = controlText(state.controlMode);
    this.motionButton.textContent = motionText(state.reduceMotion);
    this.overlay.hidden = false;
  }

  hide(): void {
    this.overlay.hidden = true;
  }

  dispose(): void {
    this.overlay.remove();
  }

  private button(text: string, className: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }
}
