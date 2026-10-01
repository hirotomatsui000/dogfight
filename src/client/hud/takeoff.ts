import type { UnitSystem } from '../../shared/data/aircraft/types.ts';
import { type Bindings, keyLabel } from '../input/bindings.ts';
import type { ControlMode } from '../input/control-mapper.ts';
import { speedLabel, speedValue } from './format.ts';

/** Every jet's nose can come up by about this speed (the take-off tests lift off between 190 and 230 kt). */
export const ROTATE_SPEED_MS = 85;

/** The hint line on the take-off run (M4): power, rotation speed and how to pull, with the player's own keys. */
export function takeoffHint(mode: ControlMode, units: UnitSystem, bindings: Bindings, gamepad: boolean): string {
  const speed = `${Math.round(speedValue(ROTATE_SPEED_MS, units) / 10) * 10} ${speedLabel(units)}`;
  const power = gamepad ? 'RT' : keyLabel(bindings.throttleUp[0]);
  const pull = gamepad ? 'pull the left stick' : mode === 'mouse-aim' ? 'move the mouse up' : `hold ${keyLabel(bindings.pitchUp[0])}`;
  const brakes = gamepad ? 'D-pad up' : keyLabel(bindings.airbrake[0]);
  return `TAKE-OFF · ${power} afterburner · above ${speed} ${pull} · ${brakes} brakes`;
}
