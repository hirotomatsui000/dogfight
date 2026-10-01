import type { PerspectiveCamera, Vector3 } from 'three';
import type { ModeStatus } from '../../shared/modes/mode.ts';
import type { AircraftView, GroundTargetView, MissileView } from '../session/game-session.ts';
import type { KillFeedLine } from './kill-feed.ts';
import type { TrainingPrompt } from './training-prompts.ts';

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
  /** the local aircraft was just hit: the HIT caption for the hit sound */
  hitTaken: boolean;
  showScoreboard: boolean;
  dt: number;
  /** Strike targets (empty in other modes) */
  groundTargets: readonly GroundTargetView[];
  /** where a bomb released now would land, for an aircraft carrying bombs */
  bombImpact: Vector3 | null;
  /** the impact point is on a standing target */
  releaseCue: boolean;
  /** the lesson panel in training, otherwise null */
  training: TrainingPrompt | null;
}
