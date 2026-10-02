import type { Vector3 } from 'three';
import { createNoise2D, type Noise2D } from '../math/noise.ts';
import { clamp, smoothstep } from '../math/units.ts';

export type WeatherId = 'clear' | 'scattered' | 'broken' | 'overcast' | 'rain';

/** A weather preset (spec §12.3): cloud layer, haze and light. */
export interface WeatherPreset {
  id: WeatherId;
  label: string;
  /** share of the sky the clouds cover, 0 … 1 */
  coverage: number;
  cloudBaseM: number;
  cloudTopM: number;
  /** one continuous deck (overcast) instead of separate cumulus */
  deck: boolean;
  /** multiplies the distance haze */
  hazeFactor: number;
  /** sunlight left under the clouds */
  lightFactor: number;
  rain: boolean;
}

export const WEATHER: Readonly<Record<WeatherId, WeatherPreset>> = {
  clear: { id: 'clear', label: 'Clear', coverage: 0, cloudBaseM: 1800, cloudTopM: 2400, deck: false, hazeFactor: 0.8, lightFactor: 1, rain: false },
  scattered: { id: 'scattered', label: 'Scattered', coverage: 0.25, cloudBaseM: 1600, cloudTopM: 2700, deck: false, hazeFactor: 1, lightFactor: 1, rain: false },
  broken: { id: 'broken', label: 'Broken', coverage: 0.6, cloudBaseM: 1300, cloudTopM: 3200, deck: false, hazeFactor: 1.2, lightFactor: 0.75, rain: false },
  overcast: { id: 'overcast', label: 'Overcast', coverage: 1, cloudBaseM: 1100, cloudTopM: 2300, deck: true, hazeFactor: 1.6, lightFactor: 0.4, rain: false },
  rain: { id: 'rain', label: 'Rain', coverage: 1, cloudBaseM: 800, cloudTopM: 2600, deck: true, hazeFactor: 2.6, lightFactor: 0.28, rain: true },
};

export const WEATHER_IDS: readonly WeatherId[] = ['clear', 'scattered', 'broken', 'overcast', 'rain'];

/** Cumulus clumps are about this wide; the field is sampled on this scale. */
const CLUMP_SCALE_M = 2600;
/** Width of the soft edge of a cloud in field units. */
const EDGE = 0.12;
/** A sight line is blocked by a cloud this dense (0 … 1). */
const BLOCKING_DENSITY = 0.35;
const SAMPLE_STEP_M = 200;
const MAX_SAMPLES = 120;

/**
 * Where the clouds are (spec §12.3): a deterministic field over the map, shared by the simulation and the renderer. Clouds block visual detection and infrared locks, never radar.
 */
export class CloudField {
  readonly preset: WeatherPreset;
  private readonly noise: Noise2D;
  /** field value above which a point is cloud; chosen so the covered share matches the preset */
  private readonly threshold: number;

  constructor(preset: WeatherPreset, seed: number) {
    this.preset = preset;
    this.noise = createNoise2D(seed * 92821 + 11);
    this.threshold = preset.coverage <= 0 || preset.deck ? 0 : this.quantile(1 - preset.coverage);
  }

  /** The raw field, about 0 … 1. */
  private field(x: number, z: number): number {
    const n = this.noise;
    const u = x / CLUMP_SCALE_M;
    const v = z / CLUMP_SCALE_M;
    return 0.5 + 0.35 * n(u, v) + 0.15 * n(u * 2.3 + 17, v * 2.3 + 31);
  }

  private quantile(q: number): number {
    const samples: number[] = [];
    for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) samples.push(this.field(i * 2083 - 100000, j * 2083 - 100000));
    samples.sort((a, b) => a - b);
    return samples[clamp(Math.floor(q * samples.length), 0, samples.length - 1)];
  }

  /** Cloud cover at a map point, 0 (clear sky) … 1 (solid cloud). */
  coverAt(x: number, z: number): number {
    const p = this.preset;
    if (p.coverage <= 0) return 0;
    if (p.deck) return 1;
    return smoothstep(this.threshold - EDGE / 2, this.threshold + EDGE / 2, this.field(x, z));
  }

  /** Top of the cloud over a point: denser cover builds taller cumulus. */
  topAt(cover: number): number {
    const p = this.preset;
    return p.deck ? p.cloudTopM : p.cloudBaseM + (p.cloudTopM - p.cloudBaseM) * (0.35 + 0.65 * cover);
  }

  /** Cloud density at a point in space, 0 … 1. */
  densityAt(x: number, y: number, z: number): number {
    const p = this.preset;
    if (p.coverage <= 0 || y < p.cloudBaseM || y > p.cloudTopM) return 0;
    const c = this.coverAt(x, z);
    return c > 0 && y <= this.topAt(c) ? c : 0;
  }

  /** True when a cloud lies on the straight line between a and b. */
  blocks(a: Vector3, b: Vector3): boolean {
    const p = this.preset;
    if (p.coverage <= 0) return false;
    // Only the part of the segment inside the cloud layer matters.
    const lo = p.cloudBaseM;
    const hi = p.cloudTopM;
    if ((a.y < lo && b.y < lo) || (a.y > hi && b.y > hi)) return false;
    let t0 = 0;
    let t1 = 1;
    const dy = b.y - a.y;
    if (Math.abs(dy) > 1e-6) {
      const ta = (lo - a.y) / dy;
      const tb = (hi - a.y) / dy;
      t0 = clamp(Math.min(ta, tb), 0, 1);
      t1 = clamp(Math.max(ta, tb), 0, 1);
    }
    const len = a.distanceTo(b) * (t1 - t0);
    const n = clamp(Math.ceil(len / SAMPLE_STEP_M), 1, MAX_SAMPLES);
    for (let k = 0; k <= n; k++) {
      const t = t0 + ((t1 - t0) * k) / n;
      if (this.densityAt(a.x + (b.x - a.x) * t, a.y + dy * t, a.z + (b.z - a.z) * t) >= BLOCKING_DENSITY) return true;
    }
    return false;
  }
}
