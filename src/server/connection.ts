import { decodeInput } from '../shared/net/codec.ts';
import {
  MAX_ACTIONS_PER_S,
  MAX_CHATS_PER_S,
  MAX_CLIENT_BINARY_BYTES,
  MAX_INPUTS_PER_S,
  parseClientJson,
  ProtocolError,
  type ServerJsonMessage,
} from '../shared/net/protocol.ts';
import type { Peer } from './room.ts';
import type { RoomManager } from './room-manager.ts';

/** The parts of a WebSocket a connection uses. */
export interface SocketLike {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  /** bytes queued but not yet sent (ws provides it) */
  readonly bufferedAmount?: number;
}

export const VIOLATION_LIMIT = 3;
export const VIOLATION_WINDOW_MS = 10_000;
/** Snapshots are skipped for a client whose socket has this much unsent data (a stalled connection). */
const MAX_BUFFERED_BYTES = 1 << 20;
export const CLOSE_VIOLATIONS = 4002;
export const CLOSE_REJECTED = 4003;

/**
 * One client: checks every message (spec §7: size caps, rate limits, three violations in 10 s disconnect) and passes
 * the valid ones to its room. A misbehaving client never affects anyone else.
 */
export class ClientConnection implements Peer {
  readonly id: number;
  private readonly socket: SocketLike;
  private readonly manager: RoomManager;
  private readonly now: () => number;
  private joined = false;
  private closed = false;
  private violations: number[] = [];
  private inputWindowStart = 0;
  private inputsInWindow = 0;
  private lastChatMs = -Infinity;
  private actionWindowStart = 0;
  private actionsInWindow = 0;

  constructor(id: number, socket: SocketLike, manager: RoomManager, now: () => number = Date.now) {
    this.id = id;
    this.socket = socket;
    this.manager = manager;
    this.now = now;
  }

  sendJson(msg: ServerJsonMessage): void {
    if (!this.closed) this.socket.send(JSON.stringify(msg));
  }

  sendBinary(buf: ArrayBuffer): void {
    if (this.closed || (this.socket.bufferedAmount ?? 0) > MAX_BUFFERED_BYTES) return;
    this.socket.send(buf);
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    this.closed = true;
    this.manager.leave(this.id);
    this.socket.close(code, reason);
  }

  /** The socket closed from the other side. */
  onClose(): void {
    this.closed = true;
    this.manager.leave(this.id);
  }

  onMessage(data: string | ArrayBuffer): void {
    if (this.closed) return;
    try {
      if (typeof data === 'string') this.onJson(data);
      else this.onBinary(data);
    } catch (err) {
      if (!(err instanceof ProtocolError)) throw err;
      this.violation(err.message);
    }
  }

  private onJson(text: string): void {
    const msg = parseClientJson(text);
    if (msg.type === 'hello') {
      const result = this.manager.join(this, msg);
      if (!result.ok) {
        this.sendJson({ type: 'reject', reason: result.reason });
        this.close(CLOSE_REJECTED, 'rejected');
        return;
      }
      this.joined = true;
      return;
    }
    const room = this.manager.roomOf(this.id);
    if (!this.joined || !room) throw new ProtocolError('not in a room');
    const now = this.now();
    switch (msg.type) {
      case 'ping':
        room.pong(this.id, msg.t);
        return;
      case 'chat':
        if (now - this.lastChatMs < 1000 / MAX_CHATS_PER_S) throw new ProtocolError('chat too often');
        this.lastChatMs = now;
        room.chat(this.id, msg.index);
        return;
      default:
        if (now - this.actionWindowStart >= 1000) {
          this.actionWindowStart = now;
          this.actionsInWindow = 0;
        }
        if (++this.actionsInWindow > MAX_ACTIONS_PER_S) throw new ProtocolError('too many actions');
        if (msg.type === 'jet') room.chooseJet(this.id, msg.aircraftId);
        else if (msg.type === 'world') room.changeWorld(this.id, msg.weather, msg.hour, msg.clockRunning);
        else room.flyFrom(this.id, msg.x, msg.z);
    }
  }

  private onBinary(buf: ArrayBuffer): void {
    if (buf.byteLength > MAX_CLIENT_BINARY_BYTES) throw new ProtocolError('binary message too large');
    const room = this.manager.roomOf(this.id);
    if (!this.joined || !room) throw new ProtocolError('input before hello');
    const now = this.now();
    if (now - this.inputWindowStart >= 1000) {
      this.inputWindowStart = now;
      this.inputsInWindow = 0;
    }
    if (++this.inputsInWindow > MAX_INPUTS_PER_S) throw new ProtocolError('too many inputs');
    room.receiveInput(this.id, decodeInput(buf));
  }

  private violation(reason: string): void {
    const now = this.now();
    this.violations = this.violations.filter((t) => now - t < VIOLATION_WINDOW_MS);
    this.violations.push(now);
    console.warn(`Client ${this.id}: protocol violation (${reason})`);
    if (this.violations.length >= VIOLATION_LIMIT) this.close(CLOSE_VIOLATIONS, 'protocol violations');
  }
}
