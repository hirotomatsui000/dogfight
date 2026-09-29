import { clamp } from '../math/units.ts';

export interface AirData {
  density: number;
  temperature: number;
  speedOfSound: number;
  /** density / sea-level density */
  sigma: number;
}

export const SEA_LEVEL_DENSITY = 1.225;
const T0 = 288.15;
const LAPSE = 0.0065;
const T_TROPOPAUSE = 216.65;
const RHO_TROPOPAUSE = 0.36392;
const STRATO_SCALE_HEIGHT = 6341.6;
const DENSITY_EXPONENT = 4.2559;

/** International Standard Atmosphere, valid from -500 m to 20 km (clamped). */
export function atmosphere(altitudeM: number, out?: AirData): AirData {
  const h = clamp(altitudeM, -500, 20000);
  let temperature: number;
  let density: number;
  if (h <= 11000) {
    temperature = T0 - LAPSE * h;
    density = SEA_LEVEL_DENSITY * Math.pow(temperature / T0, DENSITY_EXPONENT);
  } else {
    temperature = T_TROPOPAUSE;
    density = RHO_TROPOPAUSE * Math.exp(-(h - 11000) / STRATO_SCALE_HEIGHT);
  }
  const result = out ?? { density: 0, temperature: 0, speedOfSound: 0, sigma: 0 };
  result.density = density;
  result.temperature = temperature;
  result.speedOfSound = 20.0468 * Math.sqrt(temperature);
  result.sigma = density / SEA_LEVEL_DENSITY;
  return result;
}
