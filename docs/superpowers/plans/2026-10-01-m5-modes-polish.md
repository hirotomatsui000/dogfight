# M5 "Modes & polish" Implementation Plan

**Goal (spec §13, §14, §15, §20, §24):** all four modes — Team Deathmatch, Air Superiority, Team Objective and Free
Flight — are playable offline and online, with an end-of-match summary, contrails, wingtip vapour and burning
wrecks, a kill cam, spectating and a jet change while waiting to respawn, fuller sound, and the remaining
accessibility options.

## Decisions made for this milestone

- **Team size offline:** the title screen gains "Pilots per side" (1, 2 or 4). Your side is you plus AI wingmen, the
  other side is AI. Strike scales its aircraft per team like online (4 per pilot). Online rooms keep the server's
  team size (default 4).
- **Air Superiority scoring** follows the spec exactly: only zones score, kills do not.
- **Capture rule:** a zone's progress runs from −1 (Russia) to +1 (USA). It moves toward the side with more aircraft
  inside at `advantage / 10 s`; nobody inside, or a tie, holds it. A side owns the zone once progress reaches its end;
  pushing progress back past 0 neutralizes it. So taking an enemy zone with +1 takes 20 s (10 to neutralize, 10 to
  capture).
- **Team Objective:** every death of a team's fighter gives the other team +1 (as in Team Deathmatch); a Sentinel
  gives +20 and takes its own team's datalink down for 60 s.
- **Datalink (spec §10.3, built now):** each aircraft also sees the enemies its teammates have on radar ("datalink
  contacts"): drawn hollow on the radar display and the map, never lockable. Sentinels carry a long-range all-round
  radar, so they are what makes a team's datalink worth having.
- **Free Flight extras:** the pause menu sets the time of day, the clock and the weather, and (offline) turns target
  drones on. On the map screen (M) a click flies you from that point, or from a runway when you click an airfield.
  Online, a Free Flight room has no bots, no weapons and no drones; anyone in it can change its time and weather.
- **Jet change:** while waiting to respawn, Q / E (the rudder keys, LB / RB on a pad) pick the next jet of your team.
- **Spectating:** after a 3 s kill cam on your killer, A / D (roll keys, the left stick on a pad) cycle through the
  pilots in the air; you watch your team first.
- **Accessibility:** "Reduce motion" now also softens the G blackout and red-out and holds the kill cam still; new
  "Reduce flashing" (steady warnings, no strobes) and "Team colours" (blue/red or a colour-blind safe blue/orange).

## Shared

- `GameMode` gains: a dynamic `combatEnabled`; `supportAircraft(map)` (Sentinels); `botGoal(ctx, aircraft)` (where a
  bot should be when it has nothing to shoot); `datalinkUp(team)`; `ModeContext.emit`. A mode registry builds a mode
  from its id for the World, the server and the client.
- **Air Superiority** (`air-superiority.ts`): three zones on the front (the perpendicular bisector of the two
  spawns), 0.4 × the combat radius apart (at most 20 km), 4 km radius, 1,000–7,000 m; +1 per owned zone every 2 s;
  first to 300 or most after 12 min; events `zone` (captured / neutralized).
- **Team Objective** (`team-objective.ts`): two Sentinels per team orbit 0.6 × the combat radius behind the front,
  either side of the team's axis, at 7,000 m and 150 m/s; 400 HP; return after 120 s; first to 60 or most after
  15 min.
- **Sentinel** aircraft data (not selectable, not in the tournament) and `SentinelPilot`: orbit, run from enemy
  fighters within 18 km, release countermeasures at missiles.
- **Bots:** with a mode goal, a bot fights enemies within 12 km of itself and otherwise flies to its goal and circles
  there: in Air Superiority the zone it should take or hold (spread over zones by id), in Team Objective the enemy
  Sentinels (attackers) or its own (escorts).
- **World:** support aircraft; datalink contacts; `setNextAircraft` (jet change at respawn); `setEnvironment`;
  `flyFrom` (Free Flight relocation).
- **Free Flight:** optional drones (four, orbiting near the player, respawning after 10 s).

## Network (protocol 4)

- Online modes: Dogfight, Air Superiority, Team Objective, Free Flight and Strike.
- Client messages `jet` (next aircraft), `world` (Free Flight weather and clock), `flyFrom` (Free Flight).
- Server message `environment` when a Free Flight room's weather or clock changes.
- The own section carries datalink contact ids. Rooms do not count Sentinels as bots; Free Flight rooms have none.

## Client

- **Title screen:** Mission (Dogfight, Air Superiority, Team Objective, Strike), Pilots per side, and a line that
  explains the chosen mission's rules.
- **HUD:** zone markers with capture progress and a zone strip under the score; Sentinel markers and the datalink
  state; datalink contacts on the radar display; banners and kill-feed lines for zones and Sentinels.
- **Map screen:** zones, Sentinel orbits, datalink contacts; Free Flight "click to fly from here".
- **Death:** kill cam, spectating, the next-jet picker, and the countdown.
- **Graphics:** a ribbon trail system for contrails (above 8 km) and wingtip vapour (above 5 G); flames and thick
  smoke on critically damaged jets; burning wrecks that fall and burst on the ground; the Sentinel model.
- **Sound:** positional explosions and nearby jets (with Doppler), missile whoosh, stall horn, pull-up tone, runway
  rumble, gear motor, rain, kill chime, zone and Sentinel cues, match-end chord.
- **End of match:** the result, a mode line (zones held, Sentinels destroyed), a table with damage dealt, and "Your
  flight" (kills, missiles fired and hit, gun hits, damage, top speed, max G, time flown).

## Tasks

1. **Plan** — this file.
2. **Mode framework and Air Superiority** — mode API, registry, zones, capture and scoring, events. Tests.
3. **Sentinels, datalink and Team Objective** — data, pilot, World support aircraft, datalink, mode. Tests.
4. **Bots for the new modes** — goals, zone contest, Sentinel attack and escort. Tests: bots capture zones; bots
   destroy Sentinels.
5. **World extras and Free Flight** — jet change, environment change, fly-from, drones. Tests.
6. **Online (protocol 4)** — modes, messages, datalink, rooms, NetworkSession, smoke test per mode. Tests.
7. **Client: modes** — title screen, HUD, map screen, banners, Sentinel model.
8. **Client: death** — kill cam, spectating, jet change.
9. **Client: graphics** — trails, damage fire, wrecks.
10. **Client: sound.**
11. **Client: Free Flight panel, accessibility.**
12. **End-of-match summary.**
13. **Verification and docs** — browser checks of every mode offline and online, smoke test, spec revision 12,
    README, handoff, push.
