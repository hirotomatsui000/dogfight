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

export type MissileKind = 'dart' | 'lance';

export interface MissileSpec {
  id: MissileKind;
  name: string;
  /** infrared: the missile's own seeker from launch; radar: the launcher's radar guides it until it goes active */
  guidance: 'ir' | 'radar';
  /** radar missiles guide on their own inside this range, × (1 − 0.5 · target stealth); 0 for infrared */
  activeRangeM: number;
  /** half-angle of the cone around the seeker axis in which the seeker can pick up a target */
  acquisitionConeDeg: number;
  /** how far off the launcher's nose the seeker can look */
  offBoresightDeg: number;
  offBoresightHelmetDeg: number;
  lockTimeS: number;
  /** lock-time multiplier for aircraft with a helmet sight */
  helmetLockTimeFactor: number;
  /** lock-time multiplier for two-seat aircraft (the back-seater runs the radar) */
  twoSeatLockTimeFactor: number;
  /** lock-time multiplier for aircraft with sensor fusion */
  sensorFusionLockTimeFactor: number;
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
  /** decoy-chance multiplier against a stealthy target (stealth ≥ STEALTHY_FROM) */
  stealthyDecoyFactor: number;
}

/** Aircraft at least this stealthy make chaff work better (spec §10.2). */
export const STEALTHY_FROM = 0.5;

/** Short-range infrared missile "Dart" (spec §10.2). */
export const SRM_DART: MissileSpec = {
  id: 'dart',
  name: 'Dart',
  guidance: 'ir',
  activeRangeM: 0,
  acquisitionConeDeg: 10,
  offBoresightDeg: 60,
  offBoresightHelmetDeg: 75,
  lockTimeS: 0.8,
  helmetLockTimeFactor: 0.7,
  twoSeatLockTimeFactor: 1,
  sensorFusionLockTimeFactor: 1,
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
  stealthyDecoyFactor: 1,
};

/**
 * Medium-range radar missile "Lance" (spec §10.2, M3). It needs a radar lock; the launcher's radar guides it until it
 * is close enough to guide itself, so the launcher must keep the target inside its radar cone until then. The seeker
 * fields that only an infrared missile uses are zero.
 */
export const MRM_LANCE: MissileSpec = {
  id: 'lance',
  name: 'Lance',
  guidance: 'radar',
  activeRangeM: 10000,
  acquisitionConeDeg: 0,
  offBoresightDeg: 0,
  offBoresightHelmetDeg: 0,
  lockTimeS: 1.5,
  helmetLockTimeFactor: 1,
  twoSeatLockTimeFactor: 0.7,
  sensorFusionLockTimeFactor: 0.8,
  lockRangeTailM: 0,
  lockRangeHeadOnM: 0,
  afterburnerRangeFactor: 1,
  lockKeepRangeFactor: 1,
  navigationConstant: 3,
  maxAccelG: 20,
  responseLagS: 0.5,
  motorAccelMs2: 110,
  burnTimeS: 8,
  maxFlightTimeS: 60,
  dragCoef: 6e-5,
  maneuverDragFactor: 0.1,
  gimbalLimitDeg: 60,
  armTimeS: 0.5,
  fuzeRadiusM: 9,
  blastFullDamageRadiusM: 4,
  blastMaxRadiusM: 18,
  blastDamage: 130,
  minLaunchIntervalS: 2,
  selfDestructSpeedMs: 250,
  decoyChance: 0.3,
  afterburnerDecoyFactor: 1,
  stealthyDecoyFactor: 1.3,
};

export const MISSILES: Readonly<Record<MissileKind, MissileSpec>> = { dart: SRM_DART, lance: MRM_LANCE };

/**
 * The player's missiles (revision 20). The owner found hitting far too hard: in bot duels a Veteran's Dart was decoyed
 * by nearly every defence (each flare salvo of the last seconds rolls again). The player's missiles lock sooner, shrug
 * off most countermeasures, turn harder and quicker and burst with a wider blast. AI pilots, wingmen included, keep
 * the plain specs.
 */
function assisted(spec: MissileSpec): MissileSpec {
  return {
    ...spec,
    acquisitionConeDeg: spec.acquisitionConeDeg * 1.3,
    lockTimeS: spec.lockTimeS * 0.7,
    navigationConstant: 3.5,
    maxAccelG: 25,
    responseLagS: 0.35,
    gimbalLimitDeg: 70,
    fuzeRadiusM: 11,
    blastFullDamageRadiusM: 6,
    blastMaxRadiusM: 20,
    decoyChance: spec.decoyChance * 0.3,
  };
}

export const PLAYER_MISSILES: Readonly<Record<MissileKind, MissileSpec>> = { dart: assisted(SRM_DART), lance: assisted(MRM_LANCE) };

/** The missiles this pilot fires: the player's assisted ones, or the plain ones for an AI pilot. */
export function missilesFor(pilot: { readonly isBot: boolean }): Readonly<Record<MissileKind, MissileSpec>> {
  return pilot.isBot ? MISSILES : PLAYER_MISSILES;
}

/** The player's cannon rounds hit within this many times the target's hit radius (revision 20; 2 at first, 3 since). */
export const PLAYER_GUN_REACH = 3;

/** One salvo is a flare and a chaff cloud: Darts roll against the flare, Lances against the chaff. */
export interface CountermeasureSpec {
  /** minimum time between two salvos */
  minIntervalS: number;
  flareBurnS: number;
  chaffLastS: number;
}

export const COUNTERMEASURES: CountermeasureSpec = { minIntervalS: 0.4, flareBurnS: 3, chaffLastS: 4 };

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
