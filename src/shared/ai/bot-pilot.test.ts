import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { CANNONS, SRM_DART } from '../data/weapons.ts';
import { DEG } from '../math/units.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import { atmosphere } from '../physics/atmosphere.ts';
import { neutralInput } from '../physics/controls.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { incomingMissileWarning } from '../targeting/warnings.ts';
import { leadDirection } from '../weapons/lead.ts';
import { launchMissile } from '../weapons/missile.ts';
import type { AircraftEntity } from '../world/entities.ts';
import { World } from '../world/world.ts';
import { DIFFICULTIES, type DifficultyProfile } from './difficulty.ts';
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

/**
 * A head-on merge: an enemy 2.5 km ahead fires a missile at the bot, which has no flares, so only its maneuver
 * can save it. Returns whether the missile hit.
 */
function headOnMissile(profile: DifficultyProfile): boolean {
  const w = newWorld();
  const bot = w.addAircraft({ callsign: 'B', team: 'russia', aircraftId: 'kobchik', bot: profile });
  const enemy = w.addAircraft({ callsign: 'E', team: 'usa', aircraftId: 'kestrel' });
  place(bot, 0, 4000, 0, 0);
  place(enemy, 0, 4000, -2500, 180);
  bot.stores.countermeasures = 0;
  bot.stores.srm = 0;
  w.combat.missiles.push(launchMissile(99, enemy, bot.id, SRM_DART));
  const full = bot.hp;
  for (let i = 0; i < 8 * 60 && bot.alive; i++) w.step(NO_INPUTS);
  return !bot.alive || bot.hp < full;
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

  it('an ace shoots down a target in a steady hard turn with the cannon', () => {
    const w = newWorld();
    const bot = w.addAircraft({ callsign: 'B', team: 'usa', aircraftId: 'kestrel', bot: DIFFICULTIES.ace });
    const target = w.addAircraft({ callsign: 'T', team: 'russia', aircraftId: 'kobchik' });
    place(bot, 0, 4000, 700, 0);
    place(target, 0, 4000, 0, 0);
    // Target banked 70 degrees right, holding a steady pull: a hard, predictable turn.
    target.flight.quat.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, -1), 70 * DEG));
    bot.stores.srm = 0;
    const turning = new Map([[target.id, { ...neutralInput(0.9), pitch: 0.5 }]]);
    for (let i = 0; i < 30 * 60 && target.alive; i++) w.step(turning);
    expect(target.alive).toBe(false);
  });

  it('saves its flares while a missile is still far off, then uses them as it closes in', () => {
    const w = newWorld();
    const bot = w.addAircraft({ callsign: 'B', team: 'russia', aircraftId: 'kobchik', bot: DIFFICULTIES.ace });
    const enemy = w.addAircraft({ callsign: 'E', team: 'usa', aircraftId: 'kestrel' });
    place(bot, 0, 4000, 0, 0);
    place(enemy, 0, 4000, 3000, 0);
    w.combat.missiles.push(launchMissile(99, enemy, bot.id, SRM_DART));
    const full = bot.config.stores.countermeasures;
    let flaresWhileFar = 0;
    for (let i = 0; i < 12 * 60 && bot.alive; i++) {
      const warning = incomingMissileWarning(bot, w.combat.missiles);
      const before = bot.stores.countermeasures;
      w.step(NO_INPUTS);
      if (warning && warning.timeToImpactS > 4) flaresWhileFar += before - bot.stores.countermeasures;
    }
    expect(flaresWhileFar).toBe(0);
    expect(bot.stores.countermeasures).toBeLessThan(full);
  });

  it('an ace dodges a head-on missile by breaking at the right moment, even without flares', () => {
    expect(headOnMissile(DIFFICULTIES.ace)).toBe(false);
  });

  it('a rookie breaks too late and too gently, and the same missile hits it', () => {
    expect(headOnMissile(DIFFICULTIES.rookie)).toBe(true);
  });

  it('fights a distant enemy with a Lance: selects it, locks on radar and fires one at a time', () => {
    const w = newWorld();
    const bot = w.addAircraft({ callsign: 'B', team: 'usa', aircraftId: 'condor', bot: DIFFICULTIES.ace });
    const enemy = w.addAircraft({ callsign: 'E', team: 'russia', aircraftId: 'yastreb' });
    place(bot, 0, 5000, 0, 0);
    place(enemy, 0, 5000, -18000, 180);
    const launches: number[] = [];
    for (let i = 0; i < 6 * 60; i++) {
      w.step(NO_INPUTS);
      for (const e of w.drainEvents()) if (e.type === 'missileLaunched' && e.kind === 'lance') launches.push(i);
    }
    expect(bot.input.weapon).toBe('mrm');
    expect(launches).toHaveLength(1);
    expect(bot.stores.mrm).toBe(bot.config.stores.mrm - 1);
  });

  it('switches to the Dart inside its range', () => {
    const w = newWorld();
    const bot = w.addAircraft({ callsign: 'B', team: 'usa', aircraftId: 'condor', bot: DIFFICULTIES.ace });
    const enemy = w.addAircraft({ callsign: 'E', team: 'russia', aircraftId: 'yastreb' });
    place(bot, 0, 5000, 0, 0);
    place(enemy, 0, 5000, -3000, 0);
    for (let i = 0; i < 30; i++) w.step(NO_INPUTS);
    expect(bot.input.weapon).toBe('srm');
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

  it('an ace beats a rookie: it wins more than 80% of the seeded duels that end in a kill, and most duels do', () => {
    let aceWins = 0;
    let decided = 0;
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
        const { winner } = runDuel(map, terrain, sides, seed);
        if (winner !== null) decided++;
        if (winner === aceSide) aceWins++;
        duels++;
      }
    }
    // Since missiles can be dodged (spec §10.2), some duels outlast the 3-minute limit once both run out of missiles.
    expect(aceWins / decided).toBeGreaterThan(0.8);
    expect(decided / duels).toBeGreaterThanOrEqual(0.7);
  }, 120000);
});
