import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { CANNONS, SRM_DART } from '../data/weapons.ts';
import { DEG } from '../math/units.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import { atmosphere } from '../physics/atmosphere.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { leadDirection } from '../weapons/lead.ts';
import { launchMissile } from '../weapons/missile.ts';
import type { AircraftEntity } from '../world/entities.ts';
import { World } from '../world/world.ts';
import { DIFFICULTIES } from './difficulty.ts';
import { runDuel } from './duel.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const newWorld = (seed = 1) => new World({ map, terrain, mode: new TeamDeathmatchMode(), seed });
const NO_INPUTS = new Map();

/** Puts an aircraft in straight flight at a position, heading and speed. */
function place(a: AircraftEntity, x: number, y: number, z: number, headingDeg: number, speed = 250, pitchDeg = 0): void {
  a.flight = createFlightState({ position: new Vector3(x, y, z), headingRad: headingDeg * DEG, pitchRad: pitchDeg * DEG, speed, throttle: 0.9 });
  a.prevPos.copy(a.flight.pos);
  a.history.reset();
}

describe('BotPilot', () => {
  it('pulls out of a low dive', () => {
    const w = newWorld();
    const bot = w.addAircraft({ callsign: 'B', team: 'usa', aircraftId: 'kestrel', bot: DIFFICULTIES.rookie });
    place(bot, 0, terrain.surfaceAt(0, 0) + 900, 0, 0, 250, -40);
    for (let i = 0; i < 15 * 60; i++) w.step(NO_INPUTS);
    expect(bot.deaths).toBe(0);
  });

  it('fires the cannon only when its aim is on the lead point', () => {
    const w = newWorld();
    const profile = { ...DIFFICULTIES.ace, aimNoiseDeg: 0 };
    const bot = w.addAircraft({ callsign: 'B', team: 'usa', aircraftId: 'kestrel', bot: profile });
    const target = w.addAircraft({ callsign: 'T', team: 'russia', aircraftId: 'kobchik' });
    place(bot, 0, 3000, 600, 0);
    place(target, 0, 3000, 0, 0);
    bot.stores.srm = 0;
    const cannon = CANNONS[bot.config.stores.cannon];
    const lead = new Vector3();
    const nose = new Vector3();
    let bursts = 0;
    for (let i = 0; i < 4 * 60 && target.alive; i++) {
      const drag = cannon.dragPerM * atmosphere(bot.flight.pos.y).sigma;
      leadDirection(bot.flight.pos, bot.flight.vel, target.flight.pos, target.flight.vel, cannon.muzzleSpeedMs, drag, lead);
      const errorDeg = nose.set(0, 0, -1).applyQuaternion(bot.flight.quat).angleTo(lead) / DEG;
      w.step(NO_INPUTS);
      if (!bot.input.fireCannon) continue;
      bursts++;
      expect(errorDeg).toBeLessThan(profile.fireThresholdDeg + 0.3);
    }
    expect(bursts).toBeGreaterThan(0);
    expect(target.hp).toBeLessThan(target.config.damage.hitPoints);
  });

  it('defends against an incoming missile: pulls hard and releases flares', () => {
    const w = newWorld();
    const bot = w.addAircraft({ callsign: 'B', team: 'russia', aircraftId: 'kobchik', bot: DIFFICULTIES.ace });
    const enemy = w.addAircraft({ callsign: 'E', team: 'usa', aircraftId: 'kestrel' });
    place(bot, 0, 4000, 0, 0);
    place(enemy, 0, 4000, 2500, 0);
    w.combat.missiles.push(launchMissile(99, enemy, bot.id, SRM_DART));
    let maxPull = 0;
    for (let i = 0; i < 90; i++) {
      w.step(NO_INPUTS);
      maxPull = Math.max(maxPull, bot.input.pitch);
    }
    expect(maxPull).toBeGreaterThan(0.9);
    expect(bot.stores.countermeasures).toBeLessThan(bot.config.stores.countermeasures);
  });

  it('heads for an enemy it cannot see yet', () => {
    const w = newWorld();
    const bot = w.addAircraft({ callsign: 'B', team: 'usa', aircraftId: 'kestrel', bot: DIFFICULTIES.veteran });
    const enemy = w.addAircraft({ callsign: 'E', team: 'russia', aircraftId: 'kobchik' });
    place(bot, 0, 4000, 0, 0);
    place(enemy, 20000, 4000, 0, 0);
    for (let i = 0; i < 3; i++) w.step(NO_INPUTS);
    expect(bot.contacts).toEqual([]);
    expect(bot.input.roll).toBeGreaterThan(0.3);
  });

  it('an ace beats a rookie in more than 80% of seeded duels', () => {
    let aceWins = 0;
    let duels = 0;
    for (let seed = 1; seed <= 15; seed++) {
      for (const aceFlies of ['kestrel', 'kobchik']) {
        const rookieFlies = aceFlies === 'kestrel' ? 'kobchik' : 'kestrel';
        const aceSide = aceFlies === 'kestrel' ? 0 : 1;
        const sides = [
          { aircraftId: 'kestrel', profile: aceSide === 0 ? DIFFICULTIES.ace : DIFFICULTIES.rookie },
          { aircraftId: 'kobchik', profile: aceSide === 1 ? DIFFICULTIES.ace : DIFFICULTIES.rookie },
        ] as const;
        expect(sides.map((s) => s.aircraftId)).toContain(rookieFlies);
        if (runDuel(map, terrain, sides, seed).winner === aceSide) aceWins++;
        duels++;
      }
    }
    expect(aceWins / duels).toBeGreaterThan(0.8);
  }, 120000);
});
