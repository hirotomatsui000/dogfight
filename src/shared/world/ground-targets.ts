import { Vector3 } from 'three';
import type { GroundTargetKind, GroundTargetSpec } from '../data/maps/map-definition.ts';
import type { Terrain } from '../map/terrain.ts';

/** Hit points of every Strike target (spec §11). */
export const GROUND_TARGET_HP = 100;

export interface GroundTarget {
  readonly id: string;
  readonly kind: GroundTargetKind;
  readonly label: string;
  /** center, on the ground */
  readonly pos: Vector3;
  readonly maxHp: number;
  hp: number;
  destroyed: boolean;
}

export function createGroundTarget(spec: GroundTargetSpec, terrain: Terrain): GroundTarget {
  return {
    id: spec.id,
    kind: spec.kind,
    label: spec.label,
    pos: new Vector3(spec.x, terrain.surfaceAt(spec.x, spec.z), spec.z),
    maxHp: GROUND_TARGET_HP,
    hp: GROUND_TARGET_HP,
    destroyed: false,
  };
}

/** 'destroyed' on the hit that takes it to 0, 'hit' otherwise, null when nothing changed. Targets are not repaired. */
export function damageGroundTarget(t: GroundTarget, amount: number): 'hit' | 'destroyed' | null {
  if (t.destroyed || amount <= 0) return null;
  t.hp = Math.max(0, t.hp - amount);
  if (t.hp > 0) return 'hit';
  t.destroyed = true;
  return 'destroyed';
}

/** Full-damage hits still needed to destroy a target. */
export function hitsToDestroy(t: GroundTarget, damagePerHit: number): number {
  return t.destroyed ? 0 : Math.ceil(t.hp / damagePerHit);
}
