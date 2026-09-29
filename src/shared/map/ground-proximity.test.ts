import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEG } from '../math/units.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { timeToImpact } from './ground-proximity.ts';
import { GridTerrain } from './terrain.ts';

const flat = GridTerrain.fromFunction(33, 40000, () => 100);
const wall = GridTerrain.fromFunction(81, 40000, (x) => (x > 500 ? 2000 : 100));

describe('timeToImpact', () => {
  it('is null in level flight well above the ground', () => {
    const s = createFlightState({ position: new Vector3(0, 3000, 0), headingRad: 0, speed: 250 });
    expect(timeToImpact(s, flat)).toBeNull();
  });
  it('predicts impact in a dive', () => {
    const s = createFlightState({ position: new Vector3(0, 600, 0), headingRad: 0, pitchRad: -45 * DEG, speed: 250 });
    const t = timeToImpact(s, flat);
    expect(t).not.toBeNull();
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(3);
  });
  it('predicts impact with rising terrain ahead', () => {
    const s = createFlightState({ position: new Vector3(0, 1000, 0), headingRad: Math.PI / 2, speed: 250 });
    expect(timeToImpact(s, wall)).not.toBeNull();
  });
});
