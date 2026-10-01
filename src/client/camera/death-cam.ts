import { Vector3 } from 'three';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { clamp } from '../../shared/math/units.ts';

/** How long the camera stays on the killer after the local jet goes down (M5); the rest of the 5 s wait spectates. */
export const KILLCAM_S = 2.5;
/** The kill cam frames a jet about this wide, so a distant killer is still seen (field of view, degrees). */
const KILLCAM_FRAME_M = 70;
const KILLCAM_MIN_FOV = 6;
const KILLCAM_MAX_FOV = 70;
/** The kill cam sits this far behind the wreck, looking past it at the killer. */
const KILLCAM_BACK_M = 45;
const KILLCAM_UP_M = 12;

/** The parts of an aircraft view the death camera needs. */
export interface WatchableView {
  readonly id: number;
  readonly team: TeamId;
  readonly alive: boolean;
  readonly isLocal: boolean;
  readonly position: Vector3;
  readonly config: { readonly support?: boolean };
}

/**
 * Who to watch while the local pilot waits to respawn (M5): fighters in the air, the pilot's own team first, then the
 * enemy, then the Sentinels, each group by id.
 */
export function watchOrder(views: Iterable<WatchableView>, team: TeamId): WatchableView[] {
  const rank = (v: WatchableView) => (v.config.support ? 2 : v.team === team ? 0 : 1);
  return [...views].filter((v) => v.alive && !v.isLocal).sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}

/** The next (+1) or previous (−1) aircraft to watch after `current`, wrapping round; null when nobody flies. */
export function cycleWatch(views: Iterable<WatchableView>, team: TeamId, current: number | null, step: number): number | null {
  const order = watchOrder(views, team);
  if (order.length === 0) return null;
  const i = order.findIndex((v) => v.id === current);
  if (i < 0) return order[step < 0 ? order.length - 1 : 0].id;
  return order[(i + step + order.length) % order.length].id;
}

/** The kill cam's field of view: wide enough to frame the killer at `distanceM`. */
export function killcamFov(distanceM: number): number {
  const deg = (2 * Math.atan(KILLCAM_FRAME_M / 2 / Math.max(distanceM, 1)) * 180) / Math.PI;
  return clamp(deg * 3, KILLCAM_MIN_FOV, KILLCAM_MAX_FOV);
}

/** Where the kill cam stands: behind the wreck on the line from the killer, a little above. */
export function killcamPosition(wreck: Vector3, killer: Vector3 | null, out: Vector3): Vector3 {
  if (!killer) return out.set(wreck.x + KILLCAM_BACK_M, wreck.y + KILLCAM_UP_M, wreck.z + KILLCAM_BACK_M);
  out.subVectors(wreck, killer).setY(0);
  if (out.lengthSq() < 1) out.set(1, 0, 0);
  return out.normalize().multiplyScalar(KILLCAM_BACK_M).add(wreck).setY(wreck.y + KILLCAM_UP_M);
}

export type DeathCamPhase = 'off' | 'killcam' | 'spectate';

/**
 * The camera's state between the local jet going down and its respawn (M5): a kill cam on the killer (or the wreck),
 * then spectating the pilots still flying.
 */
export class DeathCam {
  phase: DeathCamPhase = 'off';
  killerId: number | null = null;
  watchingId: number | null = null;
  readonly wreck = new Vector3();
  private elapsedS = 0;

  start(wreck: Vector3, killerId: number | null): void {
    this.phase = 'killcam';
    this.killerId = killerId;
    this.watchingId = null;
    this.wreck.copy(wreck);
    this.elapsedS = 0;
  }

  stop(): void {
    this.phase = 'off';
    this.killerId = null;
    this.watchingId = null;
  }

  /** Advances the kill cam into spectating, and keeps the watched aircraft one that is still flying. */
  update(dt: number, views: Iterable<WatchableView>, team: TeamId): void {
    if (this.phase === 'off') return;
    this.elapsedS += dt;
    if (this.phase === 'killcam' && this.elapsedS >= KILLCAM_S) {
      this.phase = 'spectate';
      // Watch the killer first when there is one; otherwise the first teammate.
      this.watchingId = this.killerId;
    }
    if (this.phase !== 'spectate') return;
    const list = [...views];
    const watched = list.find((v) => v.id === this.watchingId);
    if (!watched || !watched.alive) this.watchingId = cycleWatch(list, team, null, 1);
  }

  /** Switches the watched aircraft (spectating only; the kill cam skips straight to it). */
  cycle(views: Iterable<WatchableView>, team: TeamId, step: number): void {
    if (this.phase === 'off') return;
    if (this.phase === 'killcam') this.phase = 'spectate';
    this.watchingId = cycleWatch(views, team, this.watchingId, step);
  }
}
