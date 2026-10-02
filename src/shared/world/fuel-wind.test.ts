import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../ai/difficulty.ts';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { BOMB_ANVIL } from '../data/weapons.ts';
import { FreeFlightMode } from '../modes/free-flight.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { predictImpact, releaseBomb, stepBomb } from '../weapons/bomb.ts';
import type { EnvironmentSettings } from './time-of-day.ts';
import { AI_FUEL_SAVING_SHARE, DT, TICK_RATE, World } from './world.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const RAIN: EnvironmentSettings = { weather: 'rain', startHour: 12, clockRunning: false };
const run = (w: World, seconds: number, inputs: (id: number) => ReadonlyMap<number, ControlInput>, id: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) w.step(inputs(id));
};
const full = (id: number) => new Map([[id, { ...neutralInput(1), throttle: 1 }]]);

describe('fuel in the World (revision 16)', () => {
  it('burns fuel with the throttle and refuels on respawn', () => {
    const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1 });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    const tank = a.config.physics.fuelKg;
    expect(a.stores.fuelKg).toBe(tank);
    run(w, 60, full, a.id);
    const burnt = tank - a.stores.fuelKg;
    // Full afterburner at the spawn height: 4 to 7.5 kg/s.
    expect(burnt).toBeGreaterThan(4 * 60);
    expect(burnt).toBeLessThan(7.5 * 60);
    a.flight.pos.y = -10;
    const gen = a.spawnGen;
    for (let i = 0; i < 10 * TICK_RATE && a.spawnGen === gen; i++) w.step(new Map());
    expect(a.alive).toBe(true);
    expect(a.stores.fuelKg).toBe(tank);
  });

  it('flames the engines out on an empty tank: no thrust, and the jet falls behind one with fuel', () => {
    const fly = (fuelKg: number | null) => {
      const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1 });
      const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
      if (fuelKg !== null) a.stores.fuelKg = fuelKg;
      run(w, 5, full, a.id);
      return a;
    };
    const dry = fly(0);
    expect(dry.flight.thrust).toBe(0);
    expect(dry.flight.fuelFlow).toBe(0);
    expect(dry.stores.fuelKg).toBe(0);
    expect(fly(null).flight.airspeed - dry.flight.airspeed).toBeGreaterThan(30);
  });

  it('keeps AI pilots off the afterburner once the tank runs low', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 4 });
    const bot = w.addAircraft({ callsign: 'Bot', team: 'usa', aircraftId: 'kestrel', bot: DIFFICULTIES.ace });
    w.addAircraft({ callsign: 'Foe', team: 'russia', aircraftId: 'kobchik', bot: DIFFICULTIES.ace });
    bot.stores.fuelKg = (AI_FUEL_SAVING_SHARE - 0.05) * bot.config.physics.fuelKg;
    for (let i = 0; i < 20 * TICK_RATE; i++) {
      w.step(new Map());
      if (bot.alive) expect(bot.input.throttle).toBeLessThanOrEqual(0.9);
    }
  });
});

describe('wind in the World (revision 16)', () => {
  it('blows calm only when asked: the default noon is still, a rainy match is not', () => {
    const still = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1 });
    expect(still.wind.speedAt(0)).toBe(0);
    const rainy = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1, environment: RAIN });
    expect(rainy.wind.speedAt(0)).toBe(12);
    rainy.setEnvironment({ ...RAIN, weather: 'clear' });
    expect(rainy.wind.speedAt(0)).toBe(3);
  });

  it('carries aircraft with the air: ground speed and airspeed differ by the wind', () => {
    const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1, environment: RAIN });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    run(w, 10, () => new Map(), a.id);
    const air = w.wind.steadyAt(a.flight.pos.y, new Vector3());
    const relative = a.flight.vel.clone().sub(air).length();
    // Gusts are at most 35% of the wind: within a few m/s of the steady air-relative speed.
    expect(Math.abs(relative - a.flight.airspeed)).toBeLessThan(0.35 * w.wind.speedAt(a.flight.pos.y) * 1.5);
    expect(Math.abs(a.flight.vel.length() - a.flight.airspeed)).toBeGreaterThan(1);
  });

  it('brings AI pilots out of a spin by themselves', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 4, environment: RAIN });
    const bot = w.addAircraft({ callsign: 'Bot', team: 'usa', aircraftId: 'shade', bot: DIFFICULTIES.veteran });
    bot.flight = createFlightState({ position: new Vector3(map.spawns.usa.x, 7000, map.spawns.usa.z), headingRad: 0, speed: 70, throttle: 0.5 });
    bot.flight.spin = 1;
    let recovered = false;
    for (let i = 0; i < 10 * TICK_RATE && !recovered; i++) {
      w.step(new Map());
      recovered = bot.flight.spin === 0;
    }
    expect(recovered).toBe(true);
    expect(bot.alive).toBe(true);
  });

  it('drifts falling bombs downwind, and the bomb sight allows for it', () => {
    const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1, environment: RAIN });
    const flight = createFlightState({ position: new Vector3(0, 1500, 0), headingRad: 0, speed: 220 });
    const calmLanding = predictImpact(flight.pos, flight.vel, BOMB_ANVIL, terrain, DT, new Vector3())!;
    const windyLanding = predictImpact(flight.pos, flight.vel, BOMB_ANVIL, terrain, DT, new Vector3(), w.wind)!;
    const drift = windyLanding.clone().sub(calmLanding).setY(0);
    const air = w.wind.steadyAt(800, new Vector3()).setY(0);
    expect(drift.length()).toBeGreaterThan(20);
    expect(drift.angleTo(air)).toBeLessThan(0.5);
    // The real bomb lands where the sight said.
    const b = releaseBomb(1, { id: 1, team: 'russia', flight }, BOMB_ANVIL);
    while (b.pos.y > terrain.surfaceAt(b.pos.x, b.pos.z)) stepBomb(b, DT, w.wind);
    expect(Math.hypot(b.pos.x - windyLanding.x, b.pos.z - windyLanding.z)).toBeLessThan(5);
  });
});
