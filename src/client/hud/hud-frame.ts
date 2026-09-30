import type { PerspectiveCamera, Vector3 } from 'three';
import type { ModeStatus } from '../../shared/modes/mode.ts';
import type { AircraftView, MissileView } from '../session/game-session.ts';
import type { KillFeedLine } from './kill-feed.ts';

/** Everything the HUD draws in one frame. */
export interface HudFrame {
  /** the local aircraft */
  view: AircraftView;
  views: readonly AircraftView[];
  missiles: readonly MissileView[];
  /** the local aircraft's designated target */
  target: AircraftView | null;
  /** gun aim point for the designated target, when it is within gun range */
  leadDirection: Vector3 | null;
  camera: PerspectiveCamera;
  aimDirection: Vector3 | null;
  status: ModeStatus;
  radarAltitudeM: number;
  pullUp: boolean;
  /** large centered text, e.g. the respawn countdown */
  message: string | null;
  /** short notice, e.g. "MISSILE DECOYED" */
  banner: string | null;
  hint: string;
  killFeed: readonly KillFeedLine[];
  hitMarker: boolean;
  showScoreboard: boolean;
  dt: number;
}
