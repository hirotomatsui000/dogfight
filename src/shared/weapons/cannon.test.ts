import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CANNONS } from '../data/weapons.ts';
import { Rng } from '../math/rng.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { advanceProjectile, createProjectile, projectileVelocity, pullTrigger, TRIGGER_AT_REST } from './cannon.ts';

const rc20 = CANNONS['RC-20'];
const shooter = () => ({
  id: 1,
  team: 'usa' as const,
  flight: createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 250 }),
});

const fire = (seconds: number, rounds: number) => {
  const trigger = { cannonAccumulator: TRIGGER_AT_REST };
  let shots = 0;
  let left = rounds;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const n = pullTrigger(trigger, rc20, 1 / 60, left);
    shots += n;
    left -= n * rc20.roundsPerProjectile;
  }
  return shots;
};

describe('cannon', () => {
  it('fires at once when the trigger is pulled, then at the projectile rate', () => {
    expect(fire(1 / 60, 500)).toBe(1);
    expect(fire(1, 500)).toBe(26);
    expect(fire(2, 500)).toBe(51);
  });

  it('stops when the rounds run out', () => {
    expect(fire(5, 40)).toBe(10);
  });

  it('launches along the nose with the shooter velocity and the configured dispersion', () => {
    const rng = new Rng(3);
    const s = shooter();
    let sumSq = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const p = createProjectile(i, s, rc20, rng, 1.225);
      expect(p.inherited.toArray()).toEqual(s.flight.vel.toArray());
      sumSq += p.dir.x * p.dir.x;
      expect(p.dir.z).toBeLessThan(-0.999);
    }
    const sigmaX = Math.sqrt(sumSq / n);
    expect(sigmaX).toBeGreaterThan(0.9 * 2.5e-3);
    expect(sigmaX).toBeLessThan(1.1 * 2.5e-3);
  });

  it('moves along its ballistic path and keeps the previous position for hit tests', () => {
    const p = createProjectile(1, shooter(), rc20, new Rng(1), 0.9);
    advanceProjectile(p, 1 / 60);
    const step = p.pos.distanceTo(p.prevPos);
    expect(step).toBeGreaterThan((1030 + 250) / 60 - 2);
    expect(step).toBeLessThan((1030 + 250) / 60 + 1);
    expect(projectileVelocity(p, new Vector3()).length()).toBeCloseTo(step * 60, -1);
  });

  it('has less drag in thin air', () => {
    expect(createProjectile(1, shooter(), rc20, new Rng(1), 0.6).drag).toBeLessThan(createProjectile(1, shooter(), rc20, new Rng(1), 1.225).drag);
  });
});
