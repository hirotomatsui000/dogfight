import type { CannonId } from './aircraft/types.ts';

/**
 * Gameplay weapon models with fictional names and numbers (spec §10). They are abstractions for game balance,
 * not models of any real weapon.
 */

export interface CannonSpec {
  id: CannonId;
  /** simulated projectiles per second; each one stands for `roundsPerProjectile` rounds */
  projectilesPerS: number;
  roundsPerProjectile: number;
  muzzleSpeedMs: number;
  damagePerProjectile: number;
  /** standard deviation of the aim error, milliradians */
  dispersionMrad: number;
  lifetimeS: number;
  /** drag constant at sea-level density, per meter (see weapons/ballistics.ts) */
  dragPerM: number;
}

export const CANNONS: Readonly<Record<CannonId, CannonSpec>> = {
  'RC-20': {
    id: 'RC-20',
    projectilesPerS: 25,
    roundsPerProjectile: 4,
    muzzleSpeedMs: 1030,
    damagePerProjectile: 10.4,
    dispersionMrad: 2.5,
    lifetimeS: 3,
    dragPerM: 4e-4,
  },
  'RC-25': {
    id: 'RC-25',
    projectilesPerS: 18,
    roundsPerProjectile: 3,
    muzzleSpeedMs: 1000,
    damagePerProjectile: 14,
    dispersionMrad: 3,
    lifetimeS: 3,
    dragPerM: 3.6e-4,
  },
  'HC-30': {
    id: 'HC-30',
    projectilesPerS: 15,
    roundsPerProjectile: 2,
    muzzleSpeedMs: 880,
    damagePerProjectile: 17.4,
    dispersionMrad: 3.5,
    lifetimeS: 3,
    dragPerM: 3.2e-4,
  },
};

export interface MissileSpec {
  id: 'dart';
  name: string;
  /** half-angle of the cone around the seeker axis in which the seeker can pick up a target */
  acquisitionConeDeg: number;
  /** how far off the launcher's nose the seeker can look */
  offBoresightDeg: number;
  offBoresightHelmetDeg: number;
  lockTimeS: number;
  /** lock-time multiplier for aircraft with a helmet sight */
  helmetLockTimeFactor: number;
  lockRangeTailM: number;
  lockRangeHeadOnM: number;
  /** lock-range multiplier against a target on afterburner */
  afterburnerRangeFactor: number;
  /** a lock, once made, is kept out to this multiple of the lock range */
  lockKeepRangeFactor: number;
  navigationConstant: number;
  maxAccelG: number;
  /**
   * The turning acceleration follows the guidance command with this first-order lag, so a hard break timed shortly
   * before impact makes the missile miss (spec §10.2).
   */
  responseLagS: number;
  motorAccelMs2: number;
  burnTimeS: number;
  maxFlightTimeS: number;
  /** air drag: deceleration = dragCoef * density * speed² */
  dragCoef: number;
  /** extra deceleration per m/s² of turning acceleration */
  maneuverDragFactor: number;
  /** in flight, the target is lost when it is further than this from the missile's direction of flight */
  gimbalLimitDeg: number;
  /** the fuze and warhead stay safe for this long after launch */
  armTimeS: number;
  fuzeRadiusM: number;
  blastFullDamageRadiusM: number;
  blastMaxRadiusM: number;
  blastDamage: number;
  minLaunchIntervalS: number;
  /** after the motor burns out, the missile self-destructs below this speed */
  selfDestructSpeedMs: number;
  /** chance that one countermeasure salvo decoys this missile */
  decoyChance: number;
  /** decoy-chance multiplier when the target is on afterburner */
  afterburnerDecoyFactor: number;
}

/** Short-range infrared missile "Dart" (spec §10.2). */
export const SRM_DART: MissileSpec = {
  id: 'dart',
  name: 'Dart',
  acquisitionConeDeg: 10,
  offBoresightDeg: 60,
  offBoresightHelmetDeg: 75,
  lockTimeS: 0.8,
  helmetLockTimeFactor: 0.7,
  lockRangeTailM: 9000,
  lockRangeHeadOnM: 4000,
  afterburnerRangeFactor: 1.3,
  lockKeepRangeFactor: 1.2,
  navigationConstant: 3,
  maxAccelG: 20,
  responseLagS: 0.5,
  motorAccelMs2: 150,
  burnTimeS: 5,
  maxFlightTimeS: 25,
  dragCoef: 1.2e-4,
  maneuverDragFactor: 0.1,
  gimbalLimitDeg: 60,
  armTimeS: 0.3,
  fuzeRadiusM: 9,
  blastFullDamageRadiusM: 4,
  blastMaxRadiusM: 18,
  blastDamage: 130,
  minLaunchIntervalS: 1,
  selfDestructSpeedMs: 250,
  decoyChance: 0.35,
  afterburnerDecoyFactor: 0.5,
};

export interface CountermeasureSpec {
  /** minimum time between two salvos */
  minIntervalS: number;
  flareBurnS: number;
}

export const COUNTERMEASURES: CountermeasureSpec = { minIntervalS: 0.4, flareBurnS: 3 };

/** Throttle above which the engine is on afterburner (spec §5.3). */
export const AFTERBURNER_THROTTLE = 0.9;

export interface BombSpec {
  id: 'anvil';
  name: string;
  /** bombs on each new Russian aircraft in a Strike match */
  perAircraft: number;
  minReleaseIntervalS: number;
  /** drag constant at sea-level density, per meter: the bomb decelerates by dragPerM · v² */
  dragPerM: number;
  damage: number;
  fullDamageRadiusM: number;
  maxDamageRadiusM: number;
  /** a bomb still falling after this long disappears */
  maxFallS: number;
}

/** Free-fall bomb "Anvil" for the Strike mode (spec §10.4). It damages ground targets, never aircraft. */
export const BOMB_ANVIL: BombSpec = {
  id: 'anvil',
  name: 'Anvil',
  perAircraft: 8,
  minReleaseIntervalS: 0.25,
  dragPerM: 8e-5,
  damage: 40,
  fullDamageRadiusM: 30,
  maxDamageRadiusM: 90,
  maxFallS: 60,
};
