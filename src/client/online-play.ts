import type { MapId } from '../shared/data/maps/registry.ts';
import { CALM_NOON } from '../shared/world/time-of-day.ts';
import type { LoadedMap } from './render/terrain/map-loader.ts';
import { NetworkSession } from './session/network-session.ts';
import { gameServerUrl, LaggedTransport, lagFromQuery, type Transport, WebSocketTransport } from './session/net-transport.ts';
import type { StartOptions } from './ui/menu.ts';

/** Seconds between reconnect attempts after the line drops (spec §17: 1, 2 and 4 s, then a button). */
export const RECONNECT_DELAYS_MS: readonly number[] = [1000, 2000, 4000];
/** Quick-chat keys: 7, 8, 9 and 0 send the four preset lines (spec §24). */
export const CHAT_KEYS: readonly string[] = ['Digit7', 'Digit8', 'Digit9', 'Digit0'];

/**
 * Opens a session to the game server that served this page, through the lag simulator when `?lag=` is set. A new room
 * takes this player's map, weather and clock (M4); `load` builds the map the room really flies on.
 */
export function connectOnline(options: StartOptions, load: (id: MapId) => Promise<LoadedMap>): Promise<NetworkSession> {
  if (!options.online) return Promise.reject(new Error('Not an online game'));
  let transport: Transport = new WebSocketTransport(gameServerUrl(location));
  const { lagMs, jitterMs } = lagFromQuery(location.search);
  if (lagMs > 0 || jitterMs > 0) transport = new LaggedTransport(transport, lagMs, jitterMs);
  return NetworkSession.connect(
    transport,
    {
      room: options.online.room,
      callsign: options.callsign,
      aircraftId: options.aircraftId,
      mode: options.mission === 'strike' ? 'strike' : 'team-deathmatch',
      map: options.map ?? 'lechovia',
      environment: options.environment ?? CALM_NOON,
      start: options.start ?? 'air',
    },
    async (id) => {
      const m = await load(id);
      return { map: m.def, terrain: m.terrain };
    },
  );
}

/** True when the server runs a different build than this page (both real builds, not the dev server). */
export function isOutdated(pageBuild: string, serverBuild: string): boolean {
  return pageBuild !== 'dev' && serverBuild !== 'dev' && pageBuild !== serverBuild;
}

/** "A new version is available" with a reload button (spec §24). */
export function showUpdateNotice(root: HTMLElement): () => void {
  const box = document.createElement('div');
  box.className = 'update-notice';
  box.setAttribute('role', 'status');
  box.append('The game has been updated.');
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => location.reload());
  box.appendChild(reload);
  root.appendChild(box);
  return () => box.remove();
}

/** At most this many browser errors are sent to the game server per page load. */
export const MAX_ERROR_REPORTS = 5;

/** One line about a browser error for the server log: message, first stack frames and the page build. */
export function errorReport(error: unknown, build: string): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
  return JSON.stringify({ build, error: text.slice(0, 1500) });
}

function postErrorReport(body: string): void {
  fetch('/api/error', { method: 'POST', body, keepalive: true }).catch(() => {});
}

/**
 * Online only: sends uncaught errors to the server that served the page (`POST /api/error`), so whoever runs it can
 * see what broke. Returns a function that stops reporting.
 */
export function reportErrors(build: string, send: (body: string) => void = postErrorReport): () => void {
  let sent = 0;
  const report = (error: unknown) => {
    if (sent++ < MAX_ERROR_REPORTS) send(errorReport(error, build));
  };
  const onError = (e: ErrorEvent) => report(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => report(e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/** "Connection lost" while reconnecting, then Reconnect / Main menu buttons (spec §17). */
export class ConnectionOverlay {
  private readonly overlay = document.createElement('div');
  private readonly text = document.createElement('p');
  private readonly buttons = document.createElement('div');

  constructor(root: HTMLElement) {
    this.overlay.className = 'overlay translucent';
    this.overlay.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'panel narrow stack';
    const title = document.createElement('h2');
    title.textContent = 'Connection lost';
    this.text.className = 'subtitle';
    this.text.setAttribute('aria-live', 'polite');
    this.buttons.className = 'stack';
    panel.append(title, this.text, this.buttons);
    this.overlay.appendChild(panel);
    root.appendChild(this.overlay);
  }

  show(text: string, actions: readonly [label: string, run: () => void][] = []): void {
    this.text.textContent = text;
    this.buttons.replaceChildren(
      ...actions.map(([label, run], i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = i === 0 ? 'button' : 'button secondary';
        b.textContent = label;
        b.addEventListener('click', run);
        return b;
      }),
    );
    this.overlay.hidden = false;
  }

  hide(): void {
    this.overlay.hidden = true;
  }

  dispose(): void {
    this.overlay.remove();
  }
}

/** `?debug=1`: frame rate, round trip, input queue and prediction error (spec §7). */
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
