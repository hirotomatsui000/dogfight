import { describe, expect, it } from 'vitest';
import { type Clock, gameServerUrl, LaggedTransport, lagFromQuery, type Transport } from './net-transport.ts';

class ManualClock implements Clock {
  t = 0;
  private timers: { at: number; fn: () => void }[] = [];
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    this.timers.push({ at: this.t + ms, fn });
    return null;
  }
  advance(ms: number): void {
    this.t += ms;
    const due = this.timers.filter((x) => x.at <= this.t).sort((a, b) => a.at - b.at);
    this.timers = this.timers.filter((x) => x.at > this.t);
    for (const x of due) x.fn();
  }
}

class Pipe implements Transport {
  sent: (string | ArrayBuffer)[] = [];
  onOpen: (() => void) | null = null;
  onMessage: ((data: string | ArrayBuffer) => void) | null = null;
  onClose: ((clean: boolean) => void) | null = null;
  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
  }
  close(): void {}
}

describe('transports', () => {
  it('builds the WebSocket URL from the page address', () => {
    expect(gameServerUrl({ protocol: 'https:', host: 'skies.example:8443' })).toBe('wss://skies.example:8443/ws');
    expect(gameServerUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws');
  });

  it('delays both directions by the lag and never reorders, even with jitter', () => {
    const clock = new ManualClock();
    const pipe = new Pipe();
    let r = 0.9;
    const lagged = new LaggedTransport(pipe, 150, 40, clock, () => {
      r = r === 0.9 ? 0 : 0.9;
      return r;
    });
    const received: string[] = [];
    lagged.onMessage = (d) => received.push(String(d));
    lagged.send('a');
    lagged.send('b');
    pipe.onMessage?.('x');
    pipe.onMessage?.('y');
    clock.advance(149);
    expect(pipe.sent).toEqual([]);
    expect(received).toEqual([]);
    clock.advance(60);
    expect(pipe.sent).toEqual(['a', 'b']);
    expect(received).toEqual(['x', 'y']);
  });

  it('reads the lag simulator settings from the page address', () => {
    expect(lagFromQuery('?lag=150&jitter=20')).toEqual({ lagMs: 150, jitterMs: 20 });
    expect(lagFromQuery('?lag=-5')).toEqual({ lagMs: 0, jitterMs: 0 });
    expect(lagFromQuery('')).toEqual({ lagMs: 0, jitterMs: 0 });
  });
});
