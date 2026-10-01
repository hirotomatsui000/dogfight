import { Vector3 } from 'three';
import { RING_PASS_RADIUS_M } from '../../shared/modes/training.ts';
import { drawEdgeArrow } from './combat-layer.ts';
import { formatRange } from './format.ts';
import type { HudFrame } from './hud-frame.ts';
import { FONT, FONT_SMALL, PANEL, PRIMARY, WHITE } from './palette.ts';
import type { Projector, ScreenPoint } from './projector.ts';
import type { TrainingPrompt } from './training-prompts.ts';

const PANEL_TOP = 96;
const LINE_H = 20;
const pt: ScreenPoint = { x: 0, y: 0 };
const ringPos = new Vector3();

/** The lesson panel under the heading tape, and the marker on the next ring (spec §24, M1c). */
export function drawTrainingLayer(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, prompt: TrainingPrompt, width: number): void {
  ctx.save();
  ctx.font = FONT;
  let w = ctx.measureText(prompt.title).width + (prompt.progress ? ctx.measureText(prompt.progress).width + 40 : 0);
  for (const line of prompt.lines) w = Math.max(w, ctx.measureText(line).width);
  w = Math.min(w + 32, width - 32);
  const h = 18 + LINE_H * (prompt.lines.length + 1) + 6;
  const x = width / 2 - w / 2;
  ctx.shadowBlur = 0;
  ctx.fillStyle = PANEL;
  ctx.fillRect(x, PANEL_TOP, w, h);
  ctx.fillStyle = PRIMARY;
  ctx.fillText(prompt.title, x + 16, PANEL_TOP + 24);
  if (prompt.progress) ctx.fillText(prompt.progress, x + w - 16 - ctx.measureText(prompt.progress).width, PANEL_TOP + 24);
  ctx.fillStyle = WHITE;
  prompt.lines.forEach((line, i) => ctx.fillText(line, x + 16, PANEL_TOP + 24 + LINE_H * (i + 1)));
  ctx.restore();

  const ring = f.status.training?.ring;
  if (!ring || !f.view.alive) return;
  ringPos.set(ring.x, ring.y, ring.z);
  const label = `RING ${formatRange(f.view.flight.pos.distanceTo(ringPos), f.view.config.hudUnits)}`;
  if (!p.point(f.camera, ringPos, pt)) {
    drawEdgeArrow(ctx, p, f, ringPos, label, PRIMARY);
    return;
  }
  const distance = Math.max(1, f.camera.position.distanceTo(ringPos));
  const r = Math.max(14, (RING_PASS_RADIUS_M / distance) * p.pixelsPerRadian(f.camera));
  ctx.save();
  ctx.strokeStyle = PRIMARY;
  ctx.fillStyle = PRIMARY;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = FONT_SMALL;
  ctx.fillText(label, pt.x + r + 8, pt.y + 4);
  ctx.restore();
}
