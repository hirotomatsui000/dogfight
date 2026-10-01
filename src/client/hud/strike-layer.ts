import { Vector3 } from 'three';
import type { StrikeStatus } from '../../shared/modes/mode.ts';
import type { GroundTargetView } from '../session/game-session.ts';
import { drawEdgeArrow } from './combat-layer.ts';
import { formatRange } from './format.ts';
import type { HudFrame } from './hud-frame.ts';
import { AMBER, FONT, FONT_SMALL, FOE, FRIEND, GREEN, WHITE } from './palette.ts';
import type { Projector, ScreenPoint } from './projector.ts';
import { strikeStatusParts } from './strike-hud.ts';

const MARKER_PX = 11;
const HP_BAR_PX = 28;
const WRECK = 'rgba(232, 255, 240, 0.45)';
const pt: ScreenPoint = { x: 0, y: 0 };
const fpm: ScreenPoint = { x: 0, y: 0 };
const dir = new Vector3();

/** Clock, targets standing and aircraft left, where Team Deathmatch shows its score (spec §15.2). */
export function drawStrikeStatus(ctx: CanvasRenderingContext2D, f: HudFrame, s: StrikeStatus): void {
  const standing = f.groundTargets.filter((t) => !t.destroyed).length;
  ctx.save();
  ctx.font = FONT;
  let x = 16;
  for (const [text, side] of strikeStatusParts(s, f.status.timeLeftS ?? 0, standing, f.groundTargets.length, f.view.team)) {
    ctx.fillStyle = side === 'mine' ? FRIEND : side === 'theirs' ? FOE : WHITE;
    ctx.fillText(text, x, 44);
    x += ctx.measureText(text).width;
  }
  ctx.restore();
}

/** Target markers for both sides, and the bomb impact cue for an aircraft carrying bombs. */
export function drawStrikeMarkers(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, s: StrikeStatus, clock: number): void {
  // The targets belong to the defenders: friendly to them, hostile to the attackers.
  const color = f.view.team === s.defender ? FRIEND : FOE;
  for (const t of f.groundTargets) drawTargetMarker(ctx, p, f, t, color);
  if (f.bombImpact) drawBombCue(ctx, p, f, f.bombImpact, clock);
}

function drawTargetMarker(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, t: GroundTargetView, color: string): void {
  const range = formatRange(f.view.flight.pos.distanceTo(t.position), f.view.config.hudUnits);
  if (!p.point(f.camera, t.position, pt)) {
    if (!t.destroyed) drawEdgeArrow(ctx, p, f, t.position, `${t.id} ${range}`, color);
    return;
  }
  ctx.save();
  ctx.strokeStyle = t.destroyed ? WRECK : color;
  ctx.fillStyle = t.destroyed ? WRECK : color;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(pt.x - MARKER_PX, pt.y - MARKER_PX, 2 * MARKER_PX, 2 * MARKER_PX);
  ctx.font = FONT_SMALL;
  ctx.fillText(t.destroyed ? `${t.id} DESTROYED` : `${t.id} ${range}`, pt.x + MARKER_PX + 6, pt.y - 2);
  if (t.destroyed) {
    ctx.beginPath();
    ctx.moveTo(pt.x - MARKER_PX, pt.y - MARKER_PX);
    ctx.lineTo(pt.x + MARKER_PX, pt.y + MARKER_PX);
    ctx.moveTo(pt.x + MARKER_PX, pt.y - MARKER_PX);
    ctx.lineTo(pt.x - MARKER_PX, pt.y + MARKER_PX);
    ctx.stroke();
  } else {
    const y = pt.y + MARKER_PX + 5;
    ctx.strokeRect(pt.x - HP_BAR_PX / 2, y, HP_BAR_PX, 4);
    ctx.fillRect(pt.x - HP_BAR_PX / 2, y, (HP_BAR_PX * t.hp) / t.maxHp, 4);
  }
  ctx.restore();
}

/** Where a bomb released now would land, joined to the flight-path marker by the fall line (spec §15.2). */
function drawBombCue(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, impact: Vector3, clock: number): void {
  if (!p.point(f.camera, impact, pt)) return;
  ctx.save();
  const cue = f.releaseCue ? AMBER : GREEN;
  ctx.strokeStyle = cue;
  ctx.fillStyle = cue;
  ctx.lineWidth = 1.6;
  const v = f.view.flight.vel;
  if (v.lengthSq() > 1 && p.direction(f.camera, dir.copy(v).normalize(), fpm)) {
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(fpm.x, fpm.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
  ctx.fill();
  if (f.releaseCue && clock % 0.3 < 0.2) {
    ctx.font = FONT;
    ctx.fillText('RELEASE', pt.x + 14, pt.y + 5);
  }
  ctx.restore();
}
