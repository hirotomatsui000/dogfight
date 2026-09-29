import type { InputSnapshot } from './control-mapper.ts';

/** Keys whose browser default (scrolling, focus changes) must not fire while flying. */
const CAPTURED = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyF', 'KeyB']);

/** Collects DOM keyboard/mouse events into per-frame InputSnapshots. */
export class DomInput {
  private readonly target: HTMLElement;
  private readonly keys = new Set<string>();
  private pressed = new Set<string>();
  private dx = 0;
  private dy = 0;
  private wheel = 0;
  private left = false;
  private right = false;
  /** true after the browser refused a pointer-lock request */
  pointerLockRefused = false;

  constructor(target: HTMLElement) {
    this.target = target;
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.target;
  }

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    this.target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.target.addEventListener('wheel', this.onWheel, { passive: false });
    this.target.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('wheel', this.onWheel);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    if (this.pointerLocked) document.exitPointerLock();
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    // Modern browsers return a Promise that rejects when capture is refused (embedded views, no user gesture);
    // older Safari returns nothing. Either way the game stays playable with the keyboard.
    const result = this.target.requestPointerLock() as Promise<void> | undefined;
    result?.catch((err: unknown) => {
      this.pointerLockRefused = true;
      console.info('Mouse capture unavailable; click the view to try again.', err instanceof Error ? err.message : String(err));
    });
  }

  /** Returns the input since the last call and clears per-frame deltas. */
  snapshot(): InputSnapshot {
    const snap: InputSnapshot = {
      keys: new Set(this.keys),
      pressed: this.pressed,
      mouseDX: this.dx,
      mouseDY: this.dy,
      wheel: this.wheel,
      leftButton: this.left,
      rightButton: this.right,
    };
    this.pressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    return snap;
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    if (CAPTURED.has(e.code)) e.preventDefault();
    if (!e.repeat) this.pressed.add(e.code);
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.left = false;
    this.right = false;
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (!this.pointerLocked) {
      this.requestPointerLock();
      return;
    }
    if (e.button === 0) this.left = true;
    if (e.button === 2) this.right = true;
  };

  private readonly onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.left = false;
    if (e.button === 2) this.right = false;
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.wheel += e.deltaY;
  };

  private readonly onContextMenu = (e: Event) => e.preventDefault();
}
