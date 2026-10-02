# Fuel, wind and spins (spec revision 16)

Owner request (2026-10-02): make flying more realistic with fuel, wind and spins (departures from controlled flight).

## Decisions

- **Fuel.** Each jet carries internal fuel (`physics.fuelKg`, part of `massKg`, which is the full-fuel mass). The
  engines burn it from their thrust: 2.1e-5 kg per newton-second up to military power, and 1.05e-4 kg/(N·s) for the
  afterburner's extra thrust (about 1.6 and 7.4 kg/s for the Kestrel at sea level). Burning fuel makes the jet
  lighter. An empty tank flames the engines out (no thrust; the jet glides). A respawn, Training's restock and Free
  Flight's "fly from here" refuel. BINGO at 20%: the HUD and a chime say so once; FUEL turns amber, then red.
  AI pilots keep off the afterburner below 25% fuel. There is no refuelling in flight and no landing.
- **Wind.** Each weather preset has a surface wind, an upper-air wind (reached at 11 km) and a gust share; the
  direction comes from the match seed (from the west-ish, 200–340°) and veers 30° with height. Gusts are a smooth
  deterministic sum of waves in space and time. Aircraft fly in the moving air: airspeed, angle of attack and lift
  use the air-relative velocity; ground speed differs. The take-off roll uses the headwind. Bombs drag against the
  air, and the bomb sight and the AI allow for it. Cannon shells keep the shooter's velocity in this model, so wind
  does not move them relative to the target. Missiles ignore the wind. Smoke, fire and trails drift with it. The HUD
  shows ground speed and the wind (direction it blows from, speed).
- **Spins.** Stalled (angle of attack past `alphaMaxDeg`) at low dynamic pressure, a jet loses its yaw stability, and
  rolling there drops a wing; once the sideslip passes 15° it departs into a spin: it yaws round the vertical at about
  100°/s with the nose held 45° into the airflow and falls at 70–90 m/s. A very slow jet (under 30 m/s) departs too.
  `physics.departureResistance` (0–1) sets how hard that is and how fast the jet recovers; thrust vectoring keeps
  control at low speed. Recovery: after 1.5 s, neutral controls recover in a few seconds, opposite rudder and stick
  forward faster; pulling or pro-spin rudder holds the spin. After recovery the fly-by-wire keeps the angle of attack
  under the stall for 3 s so the jet can dive and gain speed. In mouse-aim mode, and for every AI pilot, the recovery
  is automatic; with keyboard steering the pilot flies it (the HUD says how).

## Tasks

1. Data and physics: fuel and departure fields, wind field, fuel flow, air-relative flight model with mass and the
   spin model, the ground roll with wind and mass. Tests.
2. World: wind per aircraft, fuel burn, flameout and refuel, AI recovery and fuel discipline, bombs and the bomb
   sight with wind. Tests.
3. Client: automatic recovery in mouse aim, HUD fuel, ground speed, wind, BINGO, FLAMEOUT and SPIN, the BINGO chime,
   smoke and trails drifting with the wind.
4. Balance: performance targets and the tournament.
5. README, spec revision 16, handoff; browser check; push.
