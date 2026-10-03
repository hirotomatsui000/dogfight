import type { Vector3 } from 'three';
import { DEG } from '../math/units.ts';

/**
 * The player's gun aim assist (revision 20): with the nose within 10° of an enemy's firing solution (the HUD pipper),
 * the rounds go to the solution; the help fades out by 15° off it. Only within gun range. The owner asked for about
 * 50 wins in 60 against Rookies; 3°/6° at first won 19 (gun-only bot duels, spec §10.5).
 */
export const GUN_ASSIST_FULL_DEG = 10;
export const GUN_ASSIST_MAX_DEG = 15;
export const GUN_ASSIST_RANGE_M = 1500;

/** How far the assist bends the rounds from the nose onto the firing solution `lead`: 0 none .. 1 all the way. */
export function gunAssistPull(nose: Vector3, lead: Vector3, rangeM: number): number {
  if (rangeM > GUN_ASSIST_RANGE_M) return 0;
  const off = nose.angleTo(lead);
  return Math.min(1, Math.max(0, (GUN_ASSIST_MAX_DEG * DEG - off) / ((GUN_ASSIST_MAX_DEG - GUN_ASSIST_FULL_DEG) * DEG)));
}

/** The direction the rounds leave in: the nose turned `pull` of the way to `lead` (both unit vectors). */
export function assistedAim(nose: Vector3, lead: Vector3, pull: number, out: Vector3): Vector3 {
  return out.copy(nose).lerp(lead, pull).normalize();
}
