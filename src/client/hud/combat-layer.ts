import { Vector3 } from 'three';
import { SRM_DART } from '../../shared/data/weapons.ts';
import { DEG } from '../../shared/math/units.ts';
import type { SeekerMode } from '../../shared/targeting/ir-seeker.ts';
import type { AircraftView } from '../session/game-session.ts';
import { formatClosure, formatRange } from './format.ts';
import type { HudFrame } from './hud-frame.ts';
import { closureRate, type EdgeMarker, edgeMarker } from './hud-geometry.ts';
import { missileAdvice } from './missile-advice.ts';
import { AMBER, FONT, FONT_BIG, FONT_SMALL, FOE, FRIEND, GREEN, RED, WHITE } from './palette.ts';
import type { Projector, ScreenPoint } from './projector.ts';

const TARGET_BOX_PX = 26;
const EDGE_MARGIN_PX = 60;
const WARNING_RING_PX = 95;
const SEEKER_LABEL: Record<SeekerMode, string> = { off: '', search: 'SRCH', track: 'TRK', locked: 'LOCK' };

const pt: ScreenPoint = { x: 0, y: 0 };
const edge: EdgeMarker = { x: 0, y: 0, angle: 0 };
const cam = new Vector3();

/** Target markers, target box and info, gun lead, seeker, weapons status and the missile warning. */
export function drawCombatLayer(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, clock: number): void {
  const me = f.view;
  if (!me.alive) return;
  const known = new Set(me.contacts.map((c) => c.id));
  for (const v of f.views) {
    if (v.isLocal || !v.alive) continue;
    const friendly = v.team === me.team;
    if (!friendly && !known.has(v.id)) continue;
    const designated = f.target !== null && v.id === f.target.id;
    if (!p.point(f.camera, v.position, pt)) {
      if (!friendly) drawEdgeArrow(ctx, p, f, v.position, formatRange(me.flight.pos.distanceTo(v.flight.pos), me.config.hudUnits), FOE);
      continue;
    }
    if (designated) drawTargetBox(ctx, f, v);
    else drawMarker(ctx, friendly);
  }
  drawMissileMarkers(ctx, p, f, clock);
  if (f.leadDirection && p.direction(f.camera, f.leadDirection, pt)) drawPipper(ctx);
  drawSeeker(ctx, p, f, clock);
  drawWeaponsStatus(ctx, p, f);
  drawMissileWarning(ctx, p, f, clock);
}

/**
 * Every missile guiding on you gets a red marker with its range (an edge arrow when off-screen), and your own
 * missiles a small white one, so both can be followed even as specks (spec §15.2).
 */
function drawMissileMarkers(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, clock: number): void {
  const me = f.view;
  for (const m of f.missiles) {
    const incoming = m.targetId === me.id;
    if (!incoming && m.ownerId !== me.id) continue;
    const label = `MSL ${formatRange(me.flight.pos.distanceTo(m.position), me.config.hudUnits)}`;
    if (!p.point(f.camera, m.position, pt)) {
      if (incoming) drawEdgeArrow(ctx, p, f, m.position, label, RED);
      continue;
    }
    ctx.save();
    if (incoming) {
      ctx.strokeStyle = RED;
      ctx.fillStyle = RED;
      ctx.lineWidth = 2;
      const r = clock % 0.4 < 0.2 ? 13 : 11;
      diamond(ctx, r);
      ctx.stroke();
      ctx.font = FONT_SMALL;
      ctx.fillText(label, pt.x + 17, pt.y + 4);
    } else {
      ctx.strokeStyle = WHITE;
      ctx.globalAlpha = 0.85;
      diamond(ctx, 6);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function diamond(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath();
  ctx.moveTo(pt.x, pt.y - r);
  ctx.lineTo(pt.x + r, pt.y);
  ctx.lineTo(pt.x, pt.y + r);
  ctx.lineTo(pt.x - r, pt.y);
  ctx.closePath();
}

function drawMarker(ctx: CanvasRenderingContext2D, friendly: boolean): void {
  ctx.save();
  ctx.strokeStyle = friendly ? FRIEND : FOE;
  ctx.beginPath();
  if (friendly) {
    // friendlies: a triangle, so team is not told by color alone
    ctx.moveTo(pt.x, pt.y - 8);
    ctx.lineTo(pt.x + 7, pt.y + 5);
    ctx.lineTo(pt.x - 7, pt.y + 5);
  } else {
    ctx.moveTo(pt.x, pt.y - 8);
    ctx.lineTo(pt.x + 8, pt.y);
    ctx.lineTo(pt.x, pt.y + 8);
    ctx.lineTo(pt.x - 8, pt.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTargetBox(ctx: CanvasRenderingContext2D, f: HudFrame, v: AircraftView): void {
  const me = f.view;
  const units = me.config.hudUnits;
  const h = TARGET_BOX_PX / 2;
  ctx.save();
  ctx.strokeStyle = FOE;
  ctx.fillStyle = FOE;
  ctx.lineWidth = 2;
  ctx.strokeRect(pt.x - h, pt.y - h, TARGET_BOX_PX, TARGET_BOX_PX);
  ctx.font = FONT_SMALL;
  const range = me.flight.pos.distanceTo(v.flight.pos);
  const closure = closureRate(me.flight.pos, me.flight.vel, v.flight.pos, v.flight.vel);
  ctx.fillText(v.config.name.toUpperCase(), pt.x + h + 6, pt.y - 4);
  ctx.fillText(`${formatRange(range, units)}  ${formatClosure(closure, units)}`, pt.x + h + 6, pt.y + 11);
  ctx.restore();
}

/** An arrow at the screen edge pointing toward something off-screen, with a label. */
function drawEdgeArrow(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, worldPos: Vector3, text: string, color: string): void {
  p.toCamera(f.camera, worldPos, cam);
  edgeMarker(cam.x, -cam.y, p.width, p.height, EDGE_MARGIN_PX, edge);
  ctx.save();
  ctx.translate(edge.x, edge.y);
  ctx.rotate(edge.angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-6, -10);
  ctx.lineTo(-6, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = FONT_SMALL;
  ctx.fillText(text, edge.x - ctx.measureText(text).width / 2, edge.y + (edge.y > p.height / 2 ? -18 : 28));
  ctx.restore();
}

/** Gun aim point: put the nose (the boresight cross) on it to hit. */
function drawPipper(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = WHITE;
  ctx.fillStyle = WHITE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSeeker(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, clock: number): void {
  const s = f.view.seeker;
  if (s.mode === 'off' || !p.direction(f.camera, s.axis, pt)) return;
  const r = Math.max(10, SRM_DART.acquisitionConeDeg * DEG * p.pixelsPerRadian(f.camera) * 0.35);
  ctx.save();
  ctx.lineWidth = 1.6;
  if (s.mode === 'search') {
    ctx.strokeStyle = GREEN;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([6, 6]);
  } else if (s.mode === 'track') {
    ctx.strokeStyle = AMBER;
    ctx.globalAlpha = clock % 0.3 < 0.18 ? 1 : 0.4;
  } else {
    ctx.strokeStyle = RED;
    ctx.lineWidth = 2.4;
  }
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (s.mode === 'locked') {
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y - r - 8);
    ctx.lineTo(pt.x, pt.y - r + 4);
    ctx.moveTo(pt.x, pt.y + r - 4);
    ctx.lineTo(pt.x, pt.y + r + 8);
    ctx.moveTo(pt.x - r - 8, pt.y);
    ctx.lineTo(pt.x - r + 4, pt.y);
    ctx.moveTo(pt.x + r - 4, pt.y);
    ctx.lineTo(pt.x + r + 8, pt.y);
    ctx.stroke();
    ctx.fillStyle = RED;
    ctx.font = FONT;
    ctx.fillText('LOCK', pt.x - 18, pt.y + r + 26);
  }
  ctx.restore();
}

function drawWeaponsStatus(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame): void {
  const me = f.view;
  const x = p.width - 230;
  const y = p.height - 64;
  ctx.save();
  ctx.font = FONT;
  ctx.fillText(`GUN ${me.stores.cannonRounds}`, x, y);
  ctx.fillText(`SRM ${me.stores.srm}`, x + 90, y);
  ctx.fillText(`FLR ${me.stores.countermeasures}`, x + 160, y);
  const label = me.stores.srm > 0 ? SEEKER_LABEL[me.seeker.mode] : 'EMPTY';
  if (label) {
    ctx.fillStyle = me.seeker.mode === 'locked' ? RED : me.seeker.mode === 'track' ? AMBER : ctx.fillStyle;
    ctx.fillText(`SRM ${label}`, x, y + 22);
  }
  ctx.restore();
}

function drawMissileWarning(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, clock: number): void {
  const w = f.view.incoming;
  if (!w) return;
  const cx = p.width / 2;
  const cy = p.height / 2;
  ctx.save();
  ctx.fillStyle = RED;
  ctx.strokeStyle = RED;
  if (clock % 0.5 < 0.3) {
    ctx.font = FONT_BIG;
    const text = `MISSILE  ${formatRange(w.rangeM, f.view.config.hudUnits)}`;
    ctx.fillText(text, cx - ctx.measureText(text).width / 2, cy - 120);
  }
  const advice = missileAdvice(w.timeToImpactS);
  if (advice.urgent) {
    // The moment a hard break beats the missile: make it impossible to miss.
    if (clock % 0.3 < 0.2) {
      ctx.save();
      ctx.fillStyle = AMBER;
      ctx.font = FONT_BIG;
      ctx.fillText(advice.text, cx - ctx.measureText(advice.text).width / 2, cy + 150);
      ctx.restore();
    }
    ctx.font = FONT_SMALL;
    const flares = 'X  FLARES';
    ctx.fillText(flares, cx - ctx.measureText(flares).width / 2, cy - 98);
  } else {
    ctx.font = FONT_SMALL;
    ctx.fillText(advice.text, cx - ctx.measureText(advice.text).width / 2, cy - 98);
  }
  ctx.translate(cx + WARNING_RING_PX * Math.sin(w.bearingRad), cy - WARNING_RING_PX * Math.cos(w.bearingRad));
  ctx.rotate(w.bearingRad);
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(10, 6);
  ctx.lineTo(-10, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
