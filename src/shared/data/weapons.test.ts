import { describe, expect, it } from 'vitest';
import { listAircraft } from './aircraft/registry.ts';
import { BOMB_ANVIL, CANNONS, COUNTERMEASURES, MISSILES, missilesFor, MRM_LANCE, PLAYER_GUN_REACH, PLAYER_MISSILES, SRM_DART } from './weapons.ts';

describe('weapon data', () => {
  it('matches the cannon table in the spec', () => {
    const rows = Object.values(CANNONS).map((c) => [c.id, c.projectilesPerS * c.roundsPerProjectile, c.muzzleSpeedMs, c.damagePerProjectile]);
    expect(rows).toEqual([
      ['RC-20', 100, 1030, 10.4],
      ['RC-25', 54, 1000, 14],
      ['HC-30', 30, 880, 17.4],
    ]);
    for (const c of Object.values(CANNONS)) {
      expect(c.lifetimeS).toBe(3);
      expect(c.dragPerM).toBeGreaterThan(0);
    }
  });

  it('matches the short-range missile table in the spec', () => {
    expect(SRM_DART).toMatchObject({
      acquisitionConeDeg: 10,
      offBoresightDeg: 60,
      offBoresightHelmetDeg: 75,
      lockTimeS: 0.8,
      lockRangeTailM: 9000,
      lockRangeHeadOnM: 4000,
      navigationConstant: 3,
      maxAccelG: 20,
      responseLagS: 0.5,
      maneuverDragFactor: 0.1,
      motorAccelMs2: 150,
      burnTimeS: 5,
      maxFlightTimeS: 25,
      fuzeRadiusM: 9,
      blastFullDamageRadiusM: 4,
      blastMaxRadiusM: 18,
      blastDamage: 130,
      decoyChance: 0.35,
    });
    expect(COUNTERMEASURES.flareBurnS).toBe(3);
  });

  it('matches the medium-range missile table in the spec', () => {
    expect(MRM_LANCE).toMatchObject({
      guidance: 'radar',
      activeRangeM: 10000,
      lockTimeS: 1.5,
      twoSeatLockTimeFactor: 0.7,
      sensorFusionLockTimeFactor: 0.8,
      navigationConstant: 3,
      maxAccelG: 20,
      responseLagS: 0.5,
      motorAccelMs2: 110,
      burnTimeS: 8,
      maxFlightTimeS: 60,
      fuzeRadiusM: 9,
      blastFullDamageRadiusM: 4,
      blastMaxRadiusM: 18,
      blastDamage: 130,
      minLaunchIntervalS: 2,
      decoyChance: 0.3,
      stealthyDecoyFactor: 1.3,
    });
    expect(SRM_DART.guidance).toBe('ir');
    expect(MISSILES.dart).toBe(SRM_DART);
    expect(MISSILES.lance).toBe(MRM_LANCE);
    expect(COUNTERMEASURES.chaffLastS).toBe(4);
  });

  it('has a cannon spec for every aircraft', () => {
    for (const a of listAircraft()) expect(CANNONS[a.stores.cannon].id).toBe(a.stores.cannon);
  });

  it('matches the bomb in the spec', () => {
    expect(BOMB_ANVIL).toMatchObject({ name: 'Anvil', perAircraft: 8, minReleaseIntervalS: 0.25, damage: 40, fullDamageRadiusM: 30, maxDamageRadiusM: 90, maxFallS: 60 });
    expect(BOMB_ANVIL.dragPerM).toBeGreaterThan(0);
  });

  it("makes the player's weapons easier to hit with than an AI pilot's (revision 20)", () => {
    expect(missilesFor({ isBot: true })).toBe(MISSILES);
    expect(missilesFor({ isBot: false })).toBe(PLAYER_MISSILES);
    for (const kind of ['dart', 'lance'] as const) {
      const plain = MISSILES[kind];
      const player = PLAYER_MISSILES[kind];
      expect(player.id).toBe(plain.id);
      expect(player.guidance).toBe(plain.guidance);
      expect(player.decoyChance).toBeCloseTo(plain.decoyChance * 0.3);
      expect(player.lockTimeS).toBeLessThan(plain.lockTimeS);
      expect(player.maxAccelG).toBeGreaterThan(plain.maxAccelG);
      expect(player.responseLagS).toBeLessThan(plain.responseLagS);
      expect(player.fuzeRadiusM).toBeGreaterThan(plain.fuzeRadiusM);
      // Same reach and load: only how well it hits changes.
      expect(player.maxFlightTimeS).toBe(plain.maxFlightTimeS);
      expect(player.blastDamage).toBe(plain.blastDamage);
    }
    expect(PLAYER_GUN_REACH).toBe(2);
  });
});
