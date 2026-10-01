import { type MissileSpec, STEALTHY_FROM } from '../data/weapons.ts';
import type { Rng } from '../math/rng.ts';

/**
 * Chance that one countermeasure salvo decoys a missile guiding on the releasing aircraft (spec §10.2): flares fool a
 * Dart less often when the target is on afterburner; chaff fools a Lance more often when the target is stealthy.
 */
export function decoyChance(spec: MissileSpec, targetOnAfterburner: boolean, targetStealth = 0): number {
  return spec.decoyChance * (targetOnAfterburner ? spec.afterburnerDecoyFactor : 1) * (targetStealth >= STEALTHY_FROM ? spec.stealthyDecoyFactor : 1);
}

export function rollDecoy(rng: Rng, chance: number): boolean {
  return rng.next() < chance;
}
