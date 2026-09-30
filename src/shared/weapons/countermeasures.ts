import type { MissileSpec } from '../data/weapons.ts';
import type { Rng } from '../math/rng.ts';

/** Chance that one countermeasure salvo decoys a missile guiding on the releasing aircraft (spec §10.2). */
export function decoyChance(spec: MissileSpec, targetOnAfterburner: boolean): number {
  return spec.decoyChance * (targetOnAfterburner ? spec.afterburnerDecoyFactor : 1);
}

export function rollDecoy(rng: Rng, chance: number): boolean {
  return rng.next() < chance;
}
