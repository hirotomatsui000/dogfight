/**
 * The sky colour of three.js's `Sky` (the Preetham daylight model) for one view direction, in the same linear units
 * the shader writes before tone mapping. The environment uses it to give the distance haze the colour of the sky at
 * the horizon, so the land fades into the sky at any time of day.
 */
export interface SkyParams {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
}

const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF_ANGLE = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE = 1000;
const RAYLEIGH_ZENITH_LENGTH = 8.4e3;
const MIE_ZENITH_LENGTH = 1.25e3;
const THREE_OVER_SIXTEENPI = 0.05968310365946075;
const ONE_OVER_FOURPI = 0.07957747154594767;

/** The sky's linear RGB looking along `dir` (unit) with the sun along `sun` (unit), as the Sky shader computes it. */
export function skyRadiance(dir: readonly [number, number, number], sun: readonly [number, number, number], p: SkyParams, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  // Vertex part: per-sun values. The sun is passed as a unit vector, as in three's examples.
  const sunE = EE * Math.max(0, 1 - Math.exp(-((CUTOFF_ANGLE - Math.acos(Math.max(-1, Math.min(1, sun[1])))) / STEEPNESS)));
  const sunfade = 1 - Math.min(1, Math.max(0, 1 - Math.exp(sun[1] / 450000)));
  const rayleighCoefficient = p.rayleigh - (1 - sunfade);
  const mieC = 0.2 * p.turbidity * 10e-18;
  // Fragment part.
  const zenithAngle = Math.acos(Math.max(0, dir[1]));
  const inverse = 1 / (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  const sR = RAYLEIGH_ZENITH_LENGTH * inverse;
  const sM = MIE_ZENITH_LENGTH * inverse;
  const cosTheta = dir[0] * sun[0] + dir[1] * sun[1] + dir[2] * sun[2];
  const rc = cosTheta * 0.5 + 0.5;
  const rPhase = THREE_OVER_SIXTEENPI * (1 + rc * rc);
  const g2 = p.mieDirectionalG * p.mieDirectionalG;
  const mPhase = ONE_OVER_FOURPI * ((1 - g2) / Math.pow(1 - 2 * p.mieDirectionalG * cosTheta + g2, 1.5));
  const fade = Math.min(1, Math.max(0, Math.pow(1 - sun[1], 5)));
  for (let c = 0; c < 3; c++) {
    const betaR = TOTAL_RAYLEIGH[c] * rayleighCoefficient;
    const betaM = 0.434 * mieC * MIE_CONST[c] * p.mieCoefficient;
    const fex = Math.exp(-(betaR * sR + betaM * sM));
    const ratio = (betaR * rPhase + betaM * mPhase) / (betaR + betaM);
    let lin = Math.pow(sunE * ratio * (1 - fex), 1.5);
    lin *= 1 + (Math.pow(sunE * ratio * fex, 0.5) - 1) * fade;
    const l0 = 0.1 * fex;
    out[c] = (lin + l0) * 0.04 + [0, 0.0003, 0.00075][c];
  }
  return out;
}

/** The average sky colour just above the horizon all the way round, for the haze. */
export function horizonColor(sun: readonly [number, number, number], p: SkyParams, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const sample: [number, number, number] = [0, 0, 0];
  out[0] = out[1] = out[2] = 0;
  const steps = 12;
  const y = Math.sin(0.03);
  const h = Math.cos(0.03);
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * 2 * Math.PI;
    skyRadiance([Math.cos(a) * h, y, Math.sin(a) * h], sun, p, sample);
    out[0] += sample[0] / steps;
    out[1] += sample[1] / steps;
    out[2] += sample[2] / steps;
  }
  return out;
}
