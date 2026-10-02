/** `?debug=1`: frame rate and a few flight readings in the corner. */
export class DebugOverlay {
  private readonly box = document.createElement('div');
  private frames = 0;
  private since: number | null = null;
  fps = 0;

  constructor(root: HTMLElement) {
    this.box.className = 'debug-overlay';
    root.appendChild(this.box);
  }

  /** `nowMs` is the frame's real time stamp: frame times are capped for the simulation, but not here. */
  frame(nowMs: number, lines: readonly string[]): void {
    this.since ??= nowMs;
    this.frames++;
    if (nowMs - this.since >= 500) {
      this.fps = (this.frames * 1000) / (nowMs - this.since);
      this.frames = 0;
      this.since = nowMs;
    }
    this.box.textContent = [`FPS ${this.fps.toFixed(this.fps < 10 ? 1 : 0)}`, ...lines].join('\n');
  }

  dispose(): void {
    this.box.remove();
  }
}
