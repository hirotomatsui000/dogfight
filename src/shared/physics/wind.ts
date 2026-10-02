import { Vector3 } from 'three';
import { Rng } from '../math/rng.ts';
import { DEG, smoothstep } from '../math/units.ts';

/** The wind of one match (spec §12.3, revision 16). */
export interface WindSettings {
  /** near the ground, m/s */
  surfaceMs: number;
  /** at 11 km and above, m/s */
  aloftMs: number;
  /** gusts as a share of the wind speed */
  gust: number;
  /** where the surface wind blows from: 0 = north, clockwise */
  fromRad: number;
}

/** The air's velocity at a height without gusts: enough for bomb sights and drifting smoke. */
export interface SteadyWind {
  steadyAt(y: number, out: Vector3): Vector3;
}

/** The wind keeps its surface speed up to LOW_M and reaches its upper-air speed at HIGH_M. */
const LOW_M = 1000;
const HIGH_M = 11000;
/** The wind veers (turns clockwise) this much from the ground to the upper air. */
const VEER_RAD = 30 * DEG;
/** Gusts: three waves in space and time, as [rad/s, wavelength in m, share of the gust]. */
const WAVES: readonly (readonly [number, number, number])[] = [
  [0.35, 1800, 0.55],
  [0.9, 700, 0.3],
  [1.7, 300, 0.15],
];
/** Up and down gusts are weaker than the ones along the ground. */
const VERTICAL_SHARE = 0.4;
/** Matches draw a westerly-ish wind: from 200° to 340°. */
const FROM_MIN = 200 * DEG;
const FROM_MAX = 340 * DEG;

/**
 * Air velocity over the map (ground frame, m/s), the same for every computer given the settings and seed. The steady
 * part grows and veers with height; gusts add a smooth, bounded wobble that changes along the flight path and in time.
 */
export class WindField implements SteadyWind {
  readonly settings: Readonly<WindSettings>;
  /** per axis (x, y, z) and wave: phase and the two horizontal wave numbers */
  private readonly phase = new Float64Array(9);
  private readonly kx = new Float64Array(9);
  private readonly kz = new Float64Array(9);

  constructor(settings: WindSettings, seed: number) {
    this.settings = { ...settings };
    const rng = new Rng(seed ^ 0x57494e44);
    for (let i = 0; i < 9; i++) {
      const k = (2 * Math.PI) / WAVES[i % 3][1];
      const heading = rng.range(0, 2 * Math.PI);
      this.kx[i] = k * Math.sin(heading);
      this.kz[i] = k * Math.cos(heading);
      this.phase[i] = rng.range(0, 2 * Math.PI);
    }
  }

  /** A weather preset's wind from a direction drawn from the seed. */
  static forWeather(w: { windMs: number; windAloftMs: number; gust: number }, seed: number): WindField {
    const fromRad = new Rng(seed ^ 0x46524f4d).range(FROM_MIN, FROM_MAX);
    return new WindField({ surfaceMs: w.windMs, aloftMs: w.windAloftMs, gust: w.gust, fromRad }, seed);
  }

  speedAt(y: number): number {
    const s = this.settings;
    return s.surfaceMs + (s.aloftMs - s.surfaceMs) * smoothstep(LOW_M, HIGH_M, y);
  }

  /** Where the wind blows from at height `y` (0 = north, clockwise). */
  fromAt(y: number): number {
    return this.settings.fromRad + VEER_RAD * smoothstep(LOW_M, HIGH_M, y);
  }

  steadyAt(y: number, out: Vector3): Vector3 {
    const speed = this.speedAt(y);
    const from = this.fromAt(y);
    // Blowing from `from` means moving toward the opposite bearing.
    return out.set(-Math.sin(from) * speed, 0, Math.cos(from) * speed);
  }

  /** The wind with gusts at a point and time. */
  at(pos: Vector3, timeS: number, out: Vector3): Vector3 {
    this.steadyAt(pos.y, out);
    const g = this.settings.gust * this.speedAt(pos.y);
    if (g <= 0) return out;
    out.x += g * this.wave(0, pos, timeS);
    out.y += g * VERTICAL_SHARE * this.wave(3, pos, timeS);
    out.z += g * this.wave(6, pos, timeS);
    return out;
  }

  private wave(first: number, pos: Vector3, timeS: number): number {
    let sum = 0;
    for (let j = 0; j < 3; j++) {
      const i = first + j;
      sum += WAVES[j][2] * Math.sin(WAVES[j][0] * timeS + this.kx[i] * pos.x + this.kz[i] * pos.z + this.phase[i]);
    }
    return sum;
  }
}

/** No wind at all (tests, and anything flown outside a World). */
export const NO_WIND: SteadyWind = { steadyAt: (_y, out) => out.set(0, 0, 0) };
