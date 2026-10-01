import { Vector3 } from 'three';
import { clamp } from '../../shared/math/units.ts';
import type { ObjectiveStatus, ZoneStatus } from '../../shared/modes/mode.ts';
import type { AircraftView } from '../session/game-session.ts';
import { drawEdgeArrow } from './combat-layer.ts';
import { formatRange } from './format.ts';
import type { HudFrame } from './hud-frame.ts';
import { objectiveLines, progressForMe, type Side, zoneActivity, zoneSide } from './objective-hud.ts';
import { AMBER, FONT, FONT_BIG, FONT_SMALL, FOE, FRIEND, WHITE } from './palette.ts';
import type { Projector, ScreenPoint } from './projector.ts';

const pt: ScreenPoint = { x: 0, y: 0 };
const at = new Vector3();
const ZONE_MARKER_PX = 15;
const SENTINEL_PX = 14;

const sideColor = (side: Side) => (side === 'mine' ? FRIEND : side === 'theirs' ? FOE : WHITE);

/** Air Superiority (M5): the zone strip under the score, zone markers in the view, and what is happening in yours. */
export function drawZones(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, zones: readonly ZoneStatus[], width: number): void {
  const me = f.view;
  ctx.save();
  // Strip: one box per zone, filled by owner, with the capture progress as a bar.
  ctx.font = FONT;
  zones.forEach((z, i) => {
    const x = 16 + i * 46;
    const y = 54;
    const color = sideColor(zoneSide(z.owner, me.team));
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = z.owner ? 0.35 : 0;
    ctx.fillRect(x, y, 36, 24);
    ctx.globalAlpha = 1;
    ctx.strokeRect(x, y, 36, 24);
    ctx.fillStyle = WHITE;
    ctx.fillText(z.id, x + 13, y + 17);
    const s = progressForMe(z, me.team);
    ctx.fillStyle = s >= 0 ? FRIEND : FOE;
    ctx.fillRect(x, y + 27, 36 * Math.abs(s), 3);
  });
  ctx.restore();
  if (!me.alive) return;
  const pos = me.flight.pos;
  for (const z of zones) {
    at.set(z.x, clamp(pos.y, z.floorM + 500, z.ceilingM - 500), z.z);
    const range = formatRange(Math.hypot(z.x - pos.x, z.z - pos.z), me.config.hudUnits);
    const color = sideColor(zoneSide(z.owner, me.team));
    if (!p.point(f.camera, at, pt)) {
      if (z.owner !== me.team) drawEdgeArrow(ctx, p, f, at, `${z.id} ${range}`, color);
      continue;
    }
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const x = pt.x + Math.cos(a) * ZONE_MARKER_PX;
      const y = pt.y + Math.sin(a) * ZONE_MARKER_PX;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    // Progress toward our side as an arc round the hexagon.
    const s = progressForMe(z, me.team);
    if (s !== 0) {
      ctx.strokeStyle = s > 0 ? FRIEND : FOE;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ZONE_MARKER_PX + 5, -Math.PI / 2, -Math.PI / 2 + Math.abs(s) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = FONT;
    ctx.fillText(z.id, pt.x - 5, pt.y + 5);
    ctx.font = FONT_SMALL;
    ctx.fillText(range, pt.x + ZONE_MARKER_PX + 8, pt.y + 4);
    ctx.restore();
  }
  const inside = zones.find((z) => Math.hypot(pos.x - z.x, pos.z - z.z) <= z.radiusM && pos.y >= z.floorM && pos.y <= z.ceilingM);
  if (inside) {
    const text = zoneActivity(inside, me.team);
    ctx.save();
    ctx.font = FONT_BIG;
    ctx.fillStyle = inside.inside[me.team] < inside.inside[me.team === 'usa' ? 'russia' : 'usa'] ? AMBER : FRIEND;
    ctx.fillText(text, width / 2 - ctx.measureText(text).width / 2, 112);
    ctx.restore();
  }
}

/** Team Objective (M5): Sentinels under the score, and Sentinel markers (own always, the enemy's when known). */
export function drawObjective(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, o: ObjectiveStatus): void {
  const me = f.view;
  ctx.save();
  ctx.font = FONT;
  objectiveLines(o, me.team).forEach((line, i) => {
    let x = 16;
    for (const [text, side] of line) {
      ctx.fillStyle = side === 'neutral' ? WHITE : sideColor(side);
      ctx.fillText(text, x, 66 + i * 20);
      x += ctx.measureText(text).width;
    }
  });
  ctx.restore();
  if (!me.alive) return;
  const known = new Set<number>([...me.contacts.map((c) => c.id), ...me.datalink]);
  for (const v of f.views) {
    if (!v.alive || !v.config.support) continue;
    const friendly = v.team === me.team;
    if (!friendly && !known.has(v.id)) continue;
    drawSentinel(ctx, p, f, v, friendly);
  }
}

function drawSentinel(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, v: AircraftView, friendly: boolean): void {
  const me = f.view;
  const color = friendly ? FRIEND : FOE;
  const range = formatRange(me.flight.pos.distanceTo(v.position), me.config.hudUnits);
  if (!p.point(f.camera, v.position, pt)) {
    if (!friendly) drawEdgeArrow(ctx, p, f, v.position, `SENTINEL ${range}`, color);
    return;
  }
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, SENTINEL_PX, 0, Math.PI * 2);
  ctx.moveTo(pt.x - SENTINEL_PX - 6, pt.y);
  ctx.lineTo(pt.x + SENTINEL_PX + 6, pt.y);
  ctx.stroke();
  ctx.font = FONT_SMALL;
  ctx.fillText(`SENTINEL ${range}`, pt.x + SENTINEL_PX + 10, pt.y - 4);
  const frac = clamp(v.hp / v.config.damage.hitPoints, 0, 1);
  ctx.strokeRect(pt.x + SENTINEL_PX + 10, pt.y + 3, 40, 4);
  ctx.fillRect(pt.x + SENTINEL_PX + 10, pt.y + 3, 40 * frac, 4);
  ctx.restore();
}

/** Datalink contacts (M5): enemies a teammate has on radar, drawn hollow and unlabelled; they cannot be locked. */
export function drawDatalink(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame): void {
  const me = f.view;
  if (!me.alive || me.datalink.length === 0) return;
  ctx.save();
  ctx.strokeStyle = FOE;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 3]);
  for (const id of me.datalink) {
    const v = f.views.find((x) => x.id === id);
    if (!v || !v.alive || v.config.support || !p.point(f.camera, v.position, pt)) continue;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y - 8);
    ctx.lineTo(pt.x + 8, pt.y);
    ctx.lineTo(pt.x, pt.y + 8);
    ctx.lineTo(pt.x - 8, pt.y);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}
