import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { FreeFlightMode } from '../modes/free-flight.ts';
import { World } from '../world/world.ts';

describe('DronePilot', () => {
  it('holds a level orbit at its altitude and speed and never fires', () => {
    const map = createTestRange(1);
    const world = new World({ map, terrain: buildTerrain(map), mode: new FreeFlightMode(), seed: 3 });
    const drone = world.addDrone({
      team: 'russia',
      aircraftId: 'kobchik',
      callsign: 'Drone',
      x: 0,
      z: 0,
      altitudeM: 3000,
      headingRad: Math.PI / 2,
      orbit: { radiusM: 6000, speedMs: 170 },
    });
    let maxDev = 0;
    let rounds = 0;
    for (let t = 0; t < 60 * 90; t++) {
      world.step(new Map());
      if (t > 60 * 20) {
        maxDev = Math.max(maxDev, Math.abs(drone.flight.pos.y - 3000));
        rounds += drone.input.fireCannon || drone.input.fireMissile ? 1 : 0;
      }
    }
    expect(drone.alive).toBe(true);
    expect(maxDev).toBeLessThan(150);
    expect(Math.abs(drone.flight.airspeed - 170)).toBeLessThan(25);
    expect(rounds).toBe(0);
    // Center of the orbit: 6 km to the right of the start (south of an eastbound start).
    expect(Math.hypot(drone.flight.pos.x - 0, drone.flight.pos.z - 6000)).toBeGreaterThan(4500);
    expect(Math.hypot(drone.flight.pos.x - 0, drone.flight.pos.z - 6000)).toBeLessThan(7500);
  });
});
