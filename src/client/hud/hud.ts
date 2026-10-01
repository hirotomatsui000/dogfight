import { Vector3 } from 'three';
import { clamp, DEG, RAD } from '../../shared/math/units.ts';
import { WARNING_CAPTIONS } from './captions.ts';
import { drawCombatLayer } from './combat-layer.ts';
import {
  altitudeLabel,
  altitudeValue,
  formatMach,
  headingDegrees,
  headingLabel,
  speedLabel,
  speedValue,
  verticalSpeedLabel,
  verticalSpeedValue,
} from './format.ts';
import { drawGameLayer } from './game-layer.ts';
import { drawDatalink, drawObjective, drawZones } from './objective-layer.ts';
import type { HudFrame } from './hud-frame.ts';
import { AMBER, FONT, FONT_BIG, FONT_SMALL, GREEN, PRIMARY, RED, SHADOW, WHITE } from './palette.ts';
import { Projector, type ScreenPoint } from './projector.ts';
import { drawRadarScope } from './radar-scope.ts';
import { drawStrikeMarkers, drawStrikeStatus } from './strike-layer.ts';
import { drawTrainingLayer } from './training-layer.ts';

export type { HudFrame } from './hud-frame.ts';

const RADAR_ALT_SHOW_M = 1500;
const SCOPE_RADIUS_PX = 80;

/** Canvas 2-D fighter HUD overlay. */
export class Hud {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly projector = new Projector();
  /** layout size in HUD units: CSS pixels divided by the HUD scale */
  private width = 0;
  private height = 0;
  private scale = 1;
  private maxG = 1;
  private gOverTime = 0;
  private clock = 0;
  /** steady warnings instead of blinking ones (M5) */
  reduceFlashing = false;
  /** softer G blackout and red-out (M5) */
  reduceMotion = false;
  private readonly dir = new Vector3();
  private readonly onResize = () => this.resize();

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hud-canvas';
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available in this browser');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  resetMaxG(): void {
    this.maxG = 1;
  }

  /** HUD size from the settings (0.8–1.4): everything scales together around the same layout. */
  setScale(scale: number): void {
    this.scale = scale;
    this.resize();
  }

  /** Dims the HUD at night so it does not dazzle (spec §12.3): 0 day … 1 night. */
  setNight(night: number): void {
    const brightness = (1 - 0.35 * Math.max(0, Math.min(1, night))).toFixed(2);
    if (this.canvas.style.opacity !== brightness) this.canvas.style.opacity = brightness;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.canvas.remove();
  }

  draw(f: HudFrame | null): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (!f) return;
    this.clock += f.dt;
    // With reduced flashing every blink holds its "on" phase.
    const blink = this.reduceFlashing ? 0.05 : this.clock;
    const flight = f.view.flight;
    if (f.view.alive) {
      this.maxG = Math.max(this.maxG, flight.gLoad);
      this.gOverTime = flight.gLoad > 7 ? this.gOverTime + f.dt : Math.max(0, this.gOverTime - 2 * f.dt);
      this.drawGEffects(flight.gLoad);
    }
    ctx.save();
    ctx.font = FONT;
    ctx.fillStyle = PRIMARY;
    ctx.strokeStyle = PRIMARY;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = 3;
    if (f.view.alive) {
      this.drawBoresight(f);
      this.drawFlightPathMarker(f);
      this.drawAimReticle(f);
      this.drawHeadingTape(f);
      this.drawSpeed(f);
      this.drawAltitude(f);
      this.drawThrottle(f);
      this.drawStatus(f);
      this.drawWarnings(f, blink);
      if (f.status.modeId !== 'free-flight' || f.status.drones) {
        drawDatalink(ctx, this.projector, f);
        drawCombatLayer(ctx, this.projector, f, blink);
        drawRadarScope(ctx, 100 + SCOPE_RADIUS_PX, this.height - 40 - SCOPE_RADIUS_PX, SCOPE_RADIUS_PX, f);
        if (f.status.strike) drawStrikeMarkers(ctx, this.projector, f, f.status.strike, blink);
      }
    }
    drawGameLayer(ctx, this.width, this.height, f);
    if (f.status.strike) drawStrikeStatus(ctx, f, f.status.strike);
    if (f.status.zones) drawZones(ctx, this.projector, f, f.status.zones, this.width);
    if (f.status.objective) drawObjective(ctx, this.projector, f, f.status.objective);
    if (f.training) drawTrainingLayer(ctx, this.projector, f, f.training, this.width);
    this.drawModeAndHint(f);
    if (f.banner) this.drawCenterText(f.banner, this.height * 0.3, AMBER, FONT_BIG);
    if (f.message) this.drawCenterText(f.message, this.height * 0.38, WHITE, FONT_BIG);
    if (f.message) (f.deathInfo ?? []).forEach((line, i) => this.drawCenterText(line, this.height * 0.38 + 34 + i * 24, WHITE, FONT));
    ctx.restore();
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.width = cssW / this.scale;
    this.height = cssH / this.scale;
    this.projector.setSize(this.width, this.height);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
  }

  private drawBoresight(f: HudFrame): void {
    const p: ScreenPoint = { x: 0, y: 0 };
    this.dir.set(0, 0, -1).applyQuaternion(f.view.quaternion);
    if (!this.projector.direction(f.camera, this.dir, p)) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(p.x - 18, p.y);
    ctx.lineTo(p.x - 8, p.y);
    ctx.lineTo(p.x - 4, p.y + 6);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + 4, p.y + 6);
    ctx.lineTo(p.x + 8, p.y);
    ctx.lineTo(p.x + 18, p.y);
    ctx.stroke();
  }

  private drawFlightPathMarker(f: HudFrame): void {
    const v = f.view.flight.vel;
    if (v.lengthSq() < 1) return;
    const p: ScreenPoint = { x: 0, y: 0 };
    if (!this.projector.direction(f.camera, this.dir.copy(v).normalize(), p)) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.moveTo(p.x - 7, p.y);
    ctx.lineTo(p.x - 18, p.y);
    ctx.moveTo(p.x + 7, p.y);
    ctx.lineTo(p.x + 18, p.y);
    ctx.moveTo(p.x, p.y - 7);
    ctx.lineTo(p.x, p.y - 14);
    ctx.stroke();
  }

  private drawAimReticle(f: HudFrame): void {
    if (!f.aimDirection) return;
    const p: ScreenPoint = { x: 0, y: 0 };
    if (!this.projector.direction(f.camera, f.aimDirection, p)) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = WHITE;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawHeadingTape(f: HudFrame): void {
    const ctx = this.ctx;
    const nose = this.dir.set(0, 0, -1).applyQuaternion(f.view.quaternion);
    const heading = headingDegrees(Math.atan2(nose.x, -nose.z));
    const cx = this.width / 2;
    const y = 46;
    const pxPerDeg = 7;
    ctx.beginPath();
    for (let d = Math.ceil((heading - 30) / 5) * 5; d <= heading + 30; d += 5) {
      const x = cx + (d - heading) * pxPerDeg;
      const major = ((d % 10) + 10) % 10 === 0;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - (major ? 10 : 5));
      if (major) {
        ctx.font = FONT_SMALL;
        const label = headingLabel(d);
        ctx.fillText(label, x - ctx.measureText(label).width / 2, y - 14);
      }
    }
    ctx.stroke();
    ctx.font = FONT;
    const text = String(heading).padStart(3, '0');
    const w = ctx.measureText(text).width + 12;
    ctx.strokeRect(cx - w / 2, y + 6, w, 22);
    ctx.fillText(text, cx - w / 2 + 6, y + 22);
  }

  private drawSpeed(f: HudFrame): void {
    const units = f.view.config.hudUnits;
    const flight = f.view.flight;
    // Stay on screen in narrow windows.
    const x = Math.max(16, this.width / 2 - 290);
    const y = this.height / 2;
    this.drawValueBox(x, y, String(Math.round(speedValue(flight.airspeed, units))), speedLabel(units));
    const ctx = this.ctx;
    ctx.fillText(formatMach(flight.mach), x, y + 44);
    ctx.fillText(`G ${flight.gLoad.toFixed(1)}  ${this.maxG.toFixed(1)}`, x, y + 64);
    ctx.fillText(`α ${(flight.alpha * RAD).toFixed(1)}`, x, y + 84);
  }

  private drawAltitude(f: HudFrame): void {
    const units = f.view.config.hudUnits;
    const flight = f.view.flight;
    const x = Math.min(this.width - 120, this.width / 2 + 200);
    const y = this.height / 2;
    const alt = altitudeValue(flight.pos.y, units);
    this.drawValueBox(x, y, String(Math.round(alt / 10) * 10), altitudeLabel(units));
    const ctx = this.ctx;
    const vs = verticalSpeedValue(flight.vel.y, units);
    ctx.fillText(`${vs >= 0 ? '+' : ''}${Math.round(vs)} ${verticalSpeedLabel(units)}`, x, y + 44);
    if (f.radarAltitudeM < RADAR_ALT_SHOW_M) {
      ctx.fillText(`R ${Math.round(altitudeValue(f.radarAltitudeM, units))}`, x, y + 64);
    }
  }

  private drawValueBox(x: number, y: number, value: string, label: string): void {
    const ctx = this.ctx;
    ctx.font = FONT_SMALL;
    ctx.fillText(label, x, y - 22);
    ctx.font = FONT_BIG;
    const w = Math.max(90, ctx.measureText(value).width + 16);
    ctx.strokeRect(x - 6, y - 18, w, 30);
    ctx.fillText(value, x + 2, y + 5);
    ctx.font = FONT;
  }

  private drawThrottle(f: HudFrame): void {
    const ctx = this.ctx;
    const t = f.view.flight.throttle;
    const x = 36;
    const h = 150;
    const y = this.height - 60 - h;
    ctx.strokeRect(x, y, 16, h);
    const ab = t > 0.9;
    ctx.save();
    ctx.fillStyle = ab ? AMBER : PRIMARY;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x + 2, y + h - (h - 4) * t - 2, 12, (h - 4) * t);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(x - 4, y + h * 0.1);
    ctx.lineTo(x + 20, y + h * 0.1);
    ctx.stroke();
    ctx.fillText(ab ? 'AB' : `${Math.round((t / 0.9) * 100)}%`, x - 4, y + h + 22);
    ctx.font = FONT_SMALL;
    ctx.fillText('THR', x - 2, y - 8);
    ctx.font = FONT;
  }

  private drawStatus(f: HudFrame): void {
    const ctx = this.ctx;
    const v = f.view;
    const x = this.width - 230;
    const y = this.height - 120;
    ctx.fillText(v.config.name.toUpperCase(), x, y);
    const frac = clamp(v.hp / v.config.damage.hitPoints, 0, 1);
    ctx.strokeRect(x, y + 10, 180, 10);
    ctx.save();
    ctx.fillStyle = frac >= 0.6 ? GREEN : frac >= 0.3 ? AMBER : RED;
    ctx.fillRect(x + 2, y + 12, 176 * frac, 6);
    ctx.restore();
    if (v.flight.airbrake > 0.1) ctx.fillText('AIRBRAKE', x + 100, y);
  }

  private drawWarnings(f: HudFrame, clock: number): void {
    const blinkOn = clock % 0.6 < 0.4;
    const stalled = f.view.flight.alpha > f.view.config.physics.alphaMaxDeg * DEG;
    if (f.hitTaken) this.drawCenterText(WARNING_CAPTIONS['hit-taken'], this.height / 2 + 150, RED, FONT_BIG);
    if (f.pullUp && blinkOn) this.drawCenterText('PULL UP', this.height / 2 + 110, RED, FONT_BIG);
    else if (stalled && blinkOn) this.drawCenterText('STALL', this.height / 2 + 110, AMBER, FONT_BIG);
    const left = f.view.boundarySecondsLeft;
    if (left !== null) this.drawCenterText(`RETURN TO COMBAT AREA  ${Math.ceil(left)}`, this.height * 0.28, AMBER, FONT_BIG);
  }

  private drawModeAndHint(f: HudFrame): void {
    const ctx = this.ctx;
    ctx.font = FONT_SMALL;
    ctx.fillText(`${f.status.label.toUpperCase()}  ·  ${f.view.callsign}${f.localTime ? `  ·  ${f.localTime}` : ''}`, 16, 22);
    ctx.globalAlpha = 0.75;
    ctx.fillText(f.hint, this.width / 2 - ctx.measureText(f.hint).width / 2, this.height - 16);
    ctx.globalAlpha = 1;
    ctx.font = FONT;
  }

  private drawCenterText(text: string, y: number, color: string, font: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, this.width / 2 - ctx.measureText(text).width / 2, y);
    ctx.restore();
  }

  private drawGEffects(g: number): void {
    const ctx = this.ctx;
    const soften = this.reduceMotion ? 0.35 : 1;
    const black = clamp((this.gOverTime - 2) / 2, 0, 0.85) * soften;
    if (black > 0) {
      const r = Math.min(this.width, this.height);
      const grad = ctx.createRadialGradient(this.width / 2, this.height / 2, r * 0.15, this.width / 2, this.height / 2, r * 0.75);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${black})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (g < -2.5) {
      ctx.fillStyle = `rgba(160, 0, 0, ${clamp((-2.5 - g) / 1.5, 0, 0.5) * soften})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }
}
