import { DEG } from '../../shared/math/units.ts';
import { headingRad } from '../../shared/physics/flight-model.ts';
import { rangeLabel, rangeValue } from './format.ts';
import type { HudFrame } from './hud-frame.ts';
import { scopePoint, scopeScale } from './hud-geometry.ts';
import { FOE, FONT_SMALL, FRIEND, PRIMARY, RED } from './palette.ts';

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
  const linked = new Set(me.datalink);
  for (const v of f.views) {
    if (v.isLocal || !v.alive) continue;
    const friendly = v.team === me.team;
    if (!friendly && !known.has(v.id) && !linked.has(v.id)) continue;
    if (!scopePoint(v.position.x - me.position.x, v.position.z - me.position.z, heading, scale, radius, pos)) continue;
    ctx.strokeStyle = friendly ? FRIEND : FOE;
    ctx.fillStyle = friendly ? FRIEND : FOE;
    const x = cx + pos.x;
    const y = cy + pos.y;
    if (v.config.support) {
      // Sentinels (M5): a circle with a bar, like their HUD marker.
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.stroke();
    } else if (!friendly && !known.has(v.id)) {
      // A datalink contact (M5): seen by a teammate's radar only, a hollow diamond.
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.stroke();
    } else if (friendly) {
      // Friend and foe differ in shape as well as color (spec §24): friends are triangles, enemies squares.
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y + 4);
      ctx.lineTo(x - 5, y + 4);
      ctx.closePath();
      ctx.stroke();
    } else if (target && v.id === target.id) {
      ctx.fillRect(x - 4, y - 4, 8, 8);
    } else {
      ctx.strokeRect(x - 4, y - 4, 8, 8);
    }
  }
  for (const m of f.missiles) {
    if (!scopePoint(m.position.x - me.position.x, m.position.z - me.position.z, heading, scale, radius, pos)) continue;
    ctx.fillStyle = m.team === me.team ? PRIMARY : RED;
    ctx.beginPath();
    ctx.arc(cx + pos.x, cy + pos.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
