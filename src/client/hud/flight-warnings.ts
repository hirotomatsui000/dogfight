import type { UnitSystem } from '../../shared/data/aircraft/types.ts';
import { RAD } from '../../shared/math/units.ts';
import { type Bindings, keyLabel } from '../input/bindings.ts';
import type { ControlMode } from '../input/control-mapper.ts';
import { speedLabel, speedValue } from './format.ts';

/** BINGO: the share of internal fuel left at which the HUD warns once and turns the fuel readout amber (revision 16). */
export const BINGO_SHARE = 0.2;

/** "FUEL 72%" for the HUD, rounded down so it reads 0% only when the tank is really empty. */
export function formatFuel(fuelKg: number, capacityKg: number): string {
  const share = capacityKg > 0 ? fuelKg / capacityKg : 0;
  return `FUEL ${fuelKg > 0 ? Math.max(1, Math.floor(share * 100)) : 0}%`;
}

/**
 * The wind as pilots read it: the bearing it blows from and its speed, "WIND 270° 25 KT". `x`/`z` are the air's
 * velocity (ground frame, north = -z). Calm under 0.5 m/s.
 */
export function formatWind(x: number, z: number, units: UnitSystem): string {
  const speed = Math.hypot(x, z);
  if (speed < 0.5) return 'WIND CALM';
  const toward = Math.atan2(x, -z) * RAD;
  const from = Math.round((toward + 180 + 360) % 360) || 360;
  return `WIND ${String(from).padStart(3, '0')}° ${Math.round(speedValue(speed, units))} ${speedLabel(units)}`;
}

/**
 * What to do in a spin (revision 16): mouse aim recovers by itself; with the keyboard, push the nose down and press
 * the rudder against the spin (`spin` +1 = spinning right). Gamepad: left stick forward, the opposite bumper.
 */
export function spinHint(mode: ControlMode, spin: number, bindings: Bindings, gamepad: boolean): string {
  if (mode === 'mouse-aim') return 'AUTO RECOVERY';
  if (gamepad) return `STICK FORWARD · ${spin > 0 ? 'LB' : 'RB'} RUDDER`;
  const rudder = spin > 0 ? bindings.yawLeft[0] : bindings.yawRight[0];
  return `${keyLabel(bindings.pitchDown[0])} NOSE DOWN · ${keyLabel(rudder)} RUDDER · LET GO OF THE ROLL`;
}
