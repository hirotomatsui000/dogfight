import type { AircraftPhysics } from '../data/aircraft/types.ts';
import { clamp, DEG, G0, lerp, smoothstep } from '../math/units.ts';

export const SIDE_FORCE_PER_RAD = 1;
const STALL_DROP_SPAN = 15 * DEG;
const POST_STALL_BLEND = 10 * DEG;

/** Lift coefficient: linear to alphaMax, then a 40% drop over 15 deg, then blends into a flat-plate curve. */
export function liftCoefficient(alpha: number, p: AircraftPhysics): number {
  const a = Math.abs(alpha);
  const sign = alpha < 0 ? -1 : 1;
  const aMax = p.alphaMaxDeg * DEG;
  const clMax = p.clAlpha * aMax;
  if (a <= aMax) return p.clAlpha * alpha;
  if (a <= aMax + STALL_DROP_SPAN) return sign * clMax * (1 - (0.4 * (a - aMax)) / STALL_DROP_SPAN);
  const edge = 0.6 * clMax;
  const flatPlate = 1.05 * Math.sin(2 * Math.min(a, Math.PI / 2));
  const t = Math.min((a - aMax - STALL_DROP_SPAN) / POST_STALL_BLEND, 1);
  return sign * lerp(edge, flatPlate, t);
}

/** Multiplier on CD0 for compressibility: 1.0 subsonic, 2.2 peak at M 1.05, 1.6 from M 2. */
export function waveDragFactor(mach: number): number {
  if (mach <= 0.85) return 1;
  if (mach <= 1.05) return 1 + 1.2 * smoothstep(0.85, 1.05, mach);
  if (mach <= 2) return 2.2 - 0.6 * smoothstep(1.05, 2, mach);
  return 1.6;
}

export function dragCoefficient(
  mach: number,
  cl: number,
  alpha: number,
  beta: number,
  airbrake: number,
  p: AircraftPhysics,
): number {
  const kEff = p.k * (1 + 0.8 * Math.max(0, mach - 1));
  const postStall = Math.max(0, Math.abs(alpha) - p.alphaMaxDeg * DEG);
  const sinPost = Math.sin(postStall);
  return p.cd0 * waveDragFactor(mach) + kEff * cl * cl + 1.5 * sinPost * sinPost + 0.5 * beta * beta + 0.08 * airbrake;
}

/** Engine thrust: throttle 0..0.9 = idle (5%)..military, 0.9..1 = military..full afterburner. */
export function thrustNewtons(
  throttle: number,
  p: AircraftPhysics,
  sigma: number,
  mach: number,
  thrustScale = 1,
): number {
  const t = clamp(throttle, 0, 1);
  const base = t <= 0.9 ? p.thrustMilN * lerp(0.05, 1, t / 0.9) : lerp(p.thrustMilN, p.thrustAbN, (t - 0.9) / 0.1);
  return base * Math.pow(sigma, 0.75) * (1 + 0.2 * mach * (1 - sigma)) * thrustScale;
}

/** Angle of attack for 1 G level flight at the given speed and density, capped at alphaMax. */
export function trimAlpha(p: AircraftPhysics, speed: number, density: number): number {
  const cl = (p.massKg * G0) / (0.5 * density * speed * speed * p.wingAreaM2);
  return Math.min(cl / p.clAlpha, p.alphaMaxDeg * DEG);
}

/** 1 G level-flight stall speed for the given air density. */
export function stallSpeed(p: AircraftPhysics, density: number): number {
  const clMax = p.clAlpha * p.alphaMaxDeg * DEG;
  return Math.sqrt((2 * p.massKg * G0) / (density * p.wingAreaM2 * clMax));
}
