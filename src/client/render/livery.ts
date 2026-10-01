import { CanvasTexture, Color, SRGBColorSpace } from 'three';
import type { AircraftVisual, TeamId } from '../../shared/data/aircraft/types.ts';
import { Rng } from '../../shared/math/rng.ts';

/**
 * Painted textures for the parametric aircraft (spec §15.4, M3): a team paint scheme (USA: soft two-tone greys;
 * Russia: blue-grey splinter camouflage), panel lines and fictional team markings. Drawn once per jet on a canvas;
 * without a DOM (tests) there are no textures and the materials keep their plain colours.
 */

export type PaintScheme = 'ghost' | 'splinter';

export interface Livery {
  scheme: PaintScheme;
  base: string;
  dark: string;
  light: string;
  underside: string;
  panelLine: string;
  /** fin flash and roundels */
  team: string;
}

const TEAM_COLOR: Readonly<Record<TeamId, string>> = { usa: '#3a6fd8', russia: '#d1452f' };

const mix = (a: string, b: string, t: number) => `#${new Color(a).lerp(new Color(b), t).getHexString()}`;

export function liveryFor(team: TeamId, v: AircraftVisual): Livery {
  const base = v.colors.primary;
  return {
    scheme: team === 'usa' ? 'ghost' : 'splinter',
    base,
    dark: v.colors.secondary,
    light: mix(base, '#ffffff', team === 'usa' ? 0.14 : 0.22),
    underside: mix(base, '#ffffff', 0.25),
    panelLine: 'rgba(20, 26, 32, 0.32)',
    team: TEAM_COLOR[team],
  };
}

/** A camouflage patch in unit texture coordinates: a soft blob (ghost) or a sharp polygon (splinter). */
export interface CamoPatch {
  shade: 'dark' | 'light';
  points: readonly (readonly [number, number])[];
}

/** Seeded patches, so every jet of a type wears the same pattern. */
export function camoPatches(scheme: PaintScheme, seed: number, count: number): CamoPatch[] {
  const rng = new Rng(seed);
  const patches: CamoPatch[] = [];
  for (let i = 0; i < count; i++) {
    const cx = rng.next();
    const cy = rng.next();
    const shade = rng.next() < (scheme === 'ghost' ? 0.75 : 0.55) ? 'dark' : 'light';
    const points: [number, number][] = [];
    if (scheme === 'ghost') {
      // Soft, rounded blobs stretched along the airframe.
      const rx = rng.range(0.08, 0.2);
      const ry = rng.range(0.05, 0.12);
      for (let k = 0; k < 10; k++) {
        const a = (2 * Math.PI * k) / 10;
        const wobble = rng.range(0.75, 1.15);
        points.push([cx + rx * wobble * Math.cos(a), cy + ry * wobble * Math.sin(a)]);
      }
    } else {
      // Sharp splinters: 4–6 corners at random angles around a centre.
      const corners = 4 + rng.int(3);
      const r = rng.range(0.08, 0.2);
      const start = rng.next() * Math.PI * 2;
      for (let k = 0; k < corners; k++) {
        const a = start + (2 * Math.PI * k) / corners + rng.range(-0.3, 0.3);
        points.push([cx + r * rng.range(0.5, 1.2) * Math.cos(a), cy + r * rng.range(0.4, 0.9) * Math.sin(a)]);
      }
    }
    patches.push({ shade, points });
  }
  return patches;
}

/** A stable seed from an aircraft id. */
export function liverySeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function drawPatches(ctx: CanvasRenderingContext2D, w: number, h: number, livery: Livery, patches: readonly CamoPatch[]): void {
  ctx.save();
  if (livery.scheme === 'ghost') ctx.filter = 'blur(6px)';
  for (const p of patches) {
    ctx.fillStyle = p.shade === 'dark' ? livery.dark : livery.light;
    ctx.globalAlpha = livery.scheme === 'ghost' ? 0.55 : 0.9;
    ctx.beginPath();
    p.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function panelLines(ctx: CanvasRenderingContext2D, w: number, h: number, livery: Livery, rng: Rng, stepX: number, stepY: number): void {
  ctx.save();
  ctx.strokeStyle = livery.panelLine;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = stepX * rng.range(0.3, 0.8); x < w; x += stepX * rng.range(0.7, 1.3)) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = stepY * rng.range(0.3, 0.8); y < h; y += stepY * rng.range(0.7, 1.3)) {
    // Stringers run only part of the way, as panels do.
    const from = rng.range(0, 0.4) * w;
    ctx.moveTo(from, y);
    ctx.lineTo(from + rng.range(0.3, 0.7) * w, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The fuselage texture: x runs along the body (nose at the left), y around it (belly, right side, top, left side,
 * belly), matching `loftGeometry`'s UVs.
 */
export function paintFuselage(ctx: CanvasRenderingContext2D, w: number, h: number, livery: Livery, seed: number, noseFraction: number): void {
  ctx.fillStyle = livery.base;
  ctx.fillRect(0, 0, w, h);
  // Lighter underside: the belly is at both the top and the bottom edge of the texture.
  for (const [y0, y1] of [
    [0, 0.2],
    [1, 0.8],
  ] as const) {
    const g = ctx.createLinearGradient(0, y0 * h, 0, y1 * h);
    g.addColorStop(0, livery.underside);
    g.addColorStop(1, `${livery.underside}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y0, y1) * h, w, Math.abs(y1 - y0) * h);
  }
  drawPatches(ctx, w, h, livery, camoPatches(livery.scheme, seed, livery.scheme === 'ghost' ? 14 : 22));
  panelLines(ctx, w, h, livery, new Rng(seed ^ 0x51ed27), w / 14, h / 6);
  // Dark radome at the tip of the nose, and an anti-glare panel ahead of the canopy.
  ctx.fillStyle = '#3a4046';
  ctx.fillRect(0, 0, w * noseFraction * 0.25, h);
  ctx.globalAlpha = 0.7;
  ctx.fillRect(w * noseFraction * 0.25, h * 0.44, w * noseFraction * 0.75, h * 0.12);
  ctx.globalAlpha = 1;
}

/** Wings and tailplanes, seen from above: x across the span, y along the body (nose at the top). */
export function paintSurfaces(ctx: CanvasRenderingContext2D, w: number, h: number, livery: Livery, seed: number, roundels: readonly Roundel[]): void {
  ctx.fillStyle = livery.base;
  ctx.fillRect(0, 0, w, h);
  drawPatches(ctx, w, h, livery, camoPatches(livery.scheme, seed ^ 0x9e37, livery.scheme === 'ghost' ? 16 : 26));
  panelLines(ctx, w, h, livery, new Rng(seed ^ 0x2f1b), w / 10, h / 12);
  for (const [u, v, ru, rv] of roundels) {
    for (const [k, color] of [
      [1, livery.team],
      [0.62, '#e8ecef'],
      [0.32, livery.team],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(u * w, v * h, ru * w * k, rv * h * k, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** A wing marking in texture coordinates: centre and radii along u and v (they differ when the span and length do). */
export type Roundel = readonly [u: number, v: number, ru: number, rv: number];

export interface LiveryTextures {
  body: CanvasTexture;
  surfaces: CanvasTexture;
}

const cache = new Map<string, LiveryTextures | null>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  // Canvas rows are drawn top-down in texture v order (v = 0 at the top), so no flip.
  t.flipY = false;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * The painted textures for one jet (cached by id), or null without a DOM. `roundels` are wing-top markings in the
 * surfaces texture's coordinates.
 */
export function liveryTextures(id: string, team: TeamId, v: AircraftVisual, roundels: readonly Roundel[]): LiveryTextures | null {
  const key = `${id}:${team}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const body = canvas(1024, 256);
  const surfaces = canvas(512, 512);
  let result: LiveryTextures | null = null;
  if (body && surfaces) {
    const livery = liveryFor(team, v);
    const seed = liverySeed(id);
    paintFuselage(body[1], 1024, 256, livery, seed, v.noseLengthFraction);
    paintSurfaces(surfaces[1], 512, 512, livery, seed, roundels);
    result = { body: texture(body[0]), surfaces: texture(surfaces[0]) };
  }
  cache.set(key, result);
  return result;
}
