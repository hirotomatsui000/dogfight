import { DEG } from '../../shared/math/units.ts';
import { headingRad } from '../../shared/physics/flight-model.ts';
import { rangeLabel, rangeValue } from './format.ts';
import type { HudFrame } from './hud-frame.ts';
import { scopePoint, scopeScale } from './hud-geometry.ts';
import { FOE, FONT_SMALL, FRIEND, GREEN, RED } from './palette.ts';

const pos = { x: 0, y: 0 };

/** Heading-up radar display (spec §15.2): radar and visual contacts, team-mates and missiles in flight. */
export function drawRadarScope(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, f: HudFrame): void {
  const me = f.view;
  if (!me.alive) return;
  const heading = headingRad(me.flight);
  const target = f.target;
  const scale = scopeScale(target ? me.flight.pos.distanceTo(target.flight.pos) : null);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(cx, cy, radius / 2, 0, Math.PI * 2);
  const cone = me.config.sensors.radarConeDeg * DEG;
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius * Math.sin(cone), cy - radius * Math.cos(cone));
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - radius * Math.sin(cone), cy - radius * Math.cos(cone));
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = FONT_SMALL;
  ctx.fillText(`${Math.round(rangeValue(scale, me.config.hudUnits))} ${rangeLabel(me.config.hudUnits)}`, cx - radius, cy + radius + 16);

  // Own aircraft.
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx + 5, cy + 5);
  ctx.lineTo(cx - 5, cy + 5);
  ctx.closePath();
  ctx.stroke();

  const known = new Set(me.contacts.map((c) => c.id));
  for (const v of f.views) {
    if (v.isLocal || !v.alive) continue;
    const friendly = v.team === me.team;
    if (!friendly && !known.has(v.id)) continue;
    if (!scopePoint(v.position.x - me.position.x, v.position.z - me.position.z, heading, scale, radius, pos)) continue;
    ctx.strokeStyle = friendly ? FRIEND : FOE;
    ctx.fillStyle = friendly ? FRIEND : FOE;
    if (target && v.id === target.id) ctx.fillRect(cx + pos.x - 4, cy + pos.y - 4, 8, 8);
    else ctx.strokeRect(cx + pos.x - 4, cy + pos.y - 4, 8, 8);
  }
  for (const m of f.missiles) {
    if (!scopePoint(m.position.x - me.position.x, m.position.z - me.position.z, heading, scale, radius, pos)) continue;
    ctx.fillStyle = m.team === me.team ? GREEN : RED;
    ctx.beginPath();
    ctx.arc(cx + pos.x, cy + pos.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
