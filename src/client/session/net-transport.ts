/** A message pipe to the game server: a WebSocket in the browser, an in-memory pipe in tests. */
export interface Transport {
  send(data: string | ArrayBuffer): void;
  close(): void;
  onOpen: (() => void) | null;
  onMessage: ((data: string | ArrayBuffer) => void) | null;
  /** `clean` is true when this side closed it */
  onClose: ((clean: boolean) => void) | null;
}

/** The game server's WebSocket URL for this page (same host, path /ws). */
export function gameServerUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export class WebSocketTransport implements Transport {
  onOpen: (() => void) | null = null;
  onMessage: ((data: string | ArrayBuffer) => void) | null = null;
  onClose: ((clean: boolean) => void) | null = null;
  private readonly ws: WebSocket;
  private closedByUs = false;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.onOpen?.();
    this.ws.onmessage = (e: MessageEvent<string | ArrayBuffer>) => this.onMessage?.(e.data);
    this.ws.onclose = () => this.onClose?.(this.closedByUs);
  }

  send(data: string | ArrayBuffer): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  close(): void {
    this.closedByUs = true;
    this.ws.close();
  }
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
}

const realClock: Clock = { now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms) };

/**
 * The lag simulator (spec §7: `?lag=<ms>&jitter=<ms>`): delays every message both ways by `lagMs` plus up to
 * `jitterMs` of random extra, never reordering them (a WebSocket never does).
 */
export class LaggedTransport implements Transport {
  onOpen: (() => void) | null = null;
  onMessage: ((data: string | ArrayBuffer) => void) | null = null;
  onClose: ((clean: boolean) => void) | null = null;
  private readonly inner: Transport;
  private readonly lagMs: number;
  private readonly jitterMs: number;
  private readonly clock: Clock;
  private readonly random: () => number;
  private lastOut = 0;
  private lastIn = 0;

  constructor(inner: Transport, lagMs: number, jitterMs = 0, clock: Clock = realClock, random: () => number = Math.random) {
    this.inner = inner;
    this.lagMs = Math.max(0, lagMs);
    this.jitterMs = Math.max(0, jitterMs);
    this.clock = clock;
    this.random = random;
    inner.onOpen = () => this.onOpen?.();
    inner.onMessage = (data) => {
      this.lastIn = this.delay(this.lastIn, () => this.onMessage?.(data));
    };
    inner.onClose = (clean) => {
      this.lastIn = this.delay(this.lastIn, () => this.onClose?.(clean));
    };
  }

  send(data: string | ArrayBuffer): void {
    this.lastOut = this.delay(this.lastOut, () => this.inner.send(data));
  }

  close(): void {
    this.inner.close();
  }

  /** Schedules `fn` after the lag, but never before the previous message in the same direction. */
  private delay(previous: number, fn: () => void): number {
    const at = Math.max(previous, this.clock.now() + this.lagMs + this.random() * this.jitterMs);
    this.clock.setTimeout(fn, at - this.clock.now());
    return at;
  }
}

/** `?lag=150&jitter=20` → { lagMs: 150, jitterMs: 20 }; absent or invalid values are 0. */
export function lagFromQuery(search: string): { lagMs: number; jitterMs: number } {
  const q = new URLSearchParams(search);
  const num = (name: string) => {
    const v = Number(q.get(name));
    return Number.isFinite(v) && v > 0 ? Math.min(v, 2000) : 0;
  };
  return { lagMs: num('lag'), jitterMs: num('jitter') };
}
