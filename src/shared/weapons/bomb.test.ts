import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { BOMB_ANVIL } from '../data/weapons.ts';
import { DEG, G0 } from '../math/units.ts';
import { SEA_LEVEL_DENSITY } from '../physics/atmosphere.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { advanceBomb, bombDamage, hasLanded, predictImpact, releaseBomb, stepBomb, surfaceCrossing } from './bomb.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const DT = 1 / 60;

/** An eastbound aircraft `aglM` above the ground at (x, z). */
function eastbound(x: number, z: number, aglM: number, speed: number, pitchDeg: number) {
  return createFlightState({ position: new Vector3(x, terrain.surfaceAt(x, z) + aglM, z), headingRad: Math.PI / 2, pitchRad: pitchDeg * DEG, speed });
}

/** Releases a bomb and steps it the way the World does until it lands. */
function dropAndFollow(x: number, z: number, aglM: number, speed: number, pitchDeg: number): Vector3 {
  const b = releaseBomb(1, { id: 7, team: 'russia', flight: eastbound(x, z, aglM, speed, pitchDeg) }, BOMB_ANVIL);
  for (let i = 0; i < 70 * 60 && !hasLanded(b, terrain); i++) stepBomb(b, DT);
  return surfaceCrossing(b.prevPos, b.pos, terrain, new Vector3());
}

describe('bombs', () => {
  it('leave with copies of the aircraft position and velocity', () => {
    const flight = createFlightState({ position: new Vector3(1, 2000, 3), headingRad: 0, speed: 220 });
    const b = releaseBomb(5, { id: 9, team: 'russia', flight }, BOMB_ANVIL);
    expect(b.pos.equals(flight.pos) && b.vel.equals(flight.vel)).toBe(true);
    expect(b.pos).not.toBe(flight.pos);
    expect(b.vel).not.toBe(flight.vel);
    expect([b.id, b.ownerId, b.team, b.ageS]).toEqual([5, 9, 'russia', 0]);
  });

  it('fall under gravity and settle at the terminal speed set by their drag', () => {
    const pos = new Vector3(0, 30000, 0);
    const vel = new Vector3();
    for (let i = 0; i < 120 * 60; i++) advanceBomb(pos, vel, BOMB_ANVIL, SEA_LEVEL_DENSITY, DT);
    const terminal = Math.sqrt(G0 / BOMB_ANVIL.dragPerM);
    expect(-vel.y).toBeGreaterThan(0.98 * terminal);
    expect(-vel.y).toBeLessThan(1.01 * terminal);
  });

  it('land well ahead of a level release and nearer after a dive', () => {
    const level = dropAndFollow(-14000, 0, 1500, 250, 0);
    const dive = dropAndFollow(-14000, 0, 1500, 250, -30);
    expect(level.x + 14000).toBeGreaterThan(2000);
    expect(level.x + 14000).toBeLessThan(5000);
    expect(dive.x + 14000).toBeLessThan(level.x + 14000);
    expect(level.y).toBeCloseTo(terrain.surfaceAt(level.x, level.z), 6);
  });

  it('predict their impact within 5 m of where they really land', () => {
    const cases: [number, number, number][] = [
      [500, 200, 0],
      [1500, 250, 0],
      [3000, 350, 0],
      [2000, 250, -30],
      [1200, 300, -15],
    ];
    for (const [agl, speed, pitch] of cases) {
      const flight = eastbound(-12000, 2000, agl, speed, pitch);
      const predicted = predictImpact(flight.pos, flight.vel, BOMB_ANVIL, terrain, DT, new Vector3());
      expect(predicted).not.toBeNull();
      const real = dropAndFollow(-12000, 2000, agl, speed, pitch);
      expect(predicted?.distanceTo(real)).toBeLessThan(5);
    }
  });

  it('predict no impact when the fall would outlast the bomb', () => {
    expect(predictImpact(new Vector3(0, 60000, 0), new Vector3(), BOMB_ANVIL, terrain, DT, new Vector3())).toBeNull();
  });

  it('do full damage within 30 m of a target and none from 90 m', () => {
    expect(bombDamage(0, BOMB_ANVIL)).toBe(40);
    expect(bombDamage(30, BOMB_ANVIL)).toBe(40);
    expect(bombDamage(60, BOMB_ANVIL)).toBeCloseTo(20, 9);
    expect(bombDamage(90, BOMB_ANVIL)).toBe(0);
    expect(bombDamage(400, BOMB_ANVIL)).toBe(0);
  });
});
