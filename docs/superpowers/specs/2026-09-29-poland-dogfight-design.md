# Contested Skies — Design Spec (revision 2)

- **Date:** 2026-09-29
- **Status:** Approved. Revision 2 incorporates the owner's project brief, which supersedes revision 1 where they differ.
- **Owner:** Hiroto Matsui
- **Working title:** Contested Skies (`contested-skies`)

## 1. Summary

A browser-based, online multiplayer flight-combat simulator prototype.
- **Teams:** USA and Russia, each flying four **fictional** fighters inspired by real aircraft.
- **Map:** a large **fictional Eastern European country, "Lechovia"**, whose geography is inspired by Poland:
  - a northern sea coast and a lake district;
  - central plains crossed by a great river;
  - southern mountains;
  - fictional cities, villages, roads and airfields.
- **Flight model:** an arcade/simulation hybrid. Real lift/drag/thrust physics with fly-by-wire style controls, so
  energy, stalls and G-limits matter while staying flyable with a mouse and keyboard.
- **Weapons:** abstracted gameplay versions of a cannon, a short-range infrared missile, a medium-range radar missile,
  and flares/chaff.
- **Multiplayer:** an authoritative Node.js server validates everything that matters. Browsers predict their own jet
  and interpolate the rest. AI bots fill empty seats.
- **Development order:** a small single-player prototype first, then multiplayer, then expansion.

## 2. Decisions log

| Topic | Decision | Source |
|---|---|---|
| Platform | Browser: Three.js client + Node.js server, TypeScript everywhere | Q&A, 2026-09-29 |
| Realism | Arcade/sim hybrid: physics-based translation, fly-by-wire rotation | Q&A + brief |
| Hosting | LAN first; Dockerfile for public deployment later | Q&A |
| Netcode | Authoritative server + client prediction/reconciliation + snapshot interpolation + lag-compensated bullets | Q&A |
| Aircraft | 8 fictional aircraft with fictional names and specifications, 4 per team, data-driven | Brief (supersedes real F-15C/F-16C/Su-27/MiG-29) |
| Weapons | Cannon, short-range IR missile, medium-range radar missile, flares + chaff; behavior abstracted | Brief (supersedes guns + IR only) |
| Map | Fictional, procedurally generated Poland-inspired landscape with fictional locations; no real-world data download | Brief (supersedes real elevation data) |
| Modes | Team Deathmatch, Air Superiority, Team Objective, Free Flight | Brief |
| Environment | Clouds, weather presets, day/night cycle | Brief |
| Development order | Playable single-player prototype first (one aircraft, test map, one AI opponent, combat, HUD), then multiplayer, then roster/map expansion, then modes/polish | Brief |

## 3. Goals and non-goals

**Goals**
1. The project stays runnable after every milestone and every major stage within one.
2. A single-player prototype (one aircraft vs one AI, test map, combat, HUD) exists before networking.
3. 8–16 human players per room with server-authoritative gameplay decisions.
4. 8 data-driven aircraft. A new aircraft needs only a data file (no flight-system changes). No aircraft is
   automatically superior: automated bot tournaments must show every pairing's win rate between 35% and 65%.
5. The Lechovia map: cities, villages, roads, rivers, forests, fields, hills/mountains, fictional airfields,
   clouds/weather, day/night.
6. Four game modes; a modern, readable fighter HUD; HUD, cockpit, chase and free cameras.
7. 60 fps on a 2020+ laptop at 1080p in a current desktop browser.

**Non-goals:** see §23.

## 4. Engine choice and rationale

**Chosen: Three.js (WebGL) client + Node.js server, all TypeScript, built with Vite, tested with Vitest.**

Why:
- **Zero install:** players join a room by opening a URL, which matters for getting 8–16 people into a test quickly.
- **One language on both sides:** the *same* TypeScript flight physics, weapons and targeting code runs on the
  authoritative server and in the browser for prediction. The two can't drift apart, and there's no duplicated logic.
- **Full rendering control:** Three.js gives direct access to terrain LOD, custom sky/cloud/haze shaders and
  effects, with no engine licensing and a large ecosystem.
- **Fast iteration and TDD:** Vite hot reload plus Vitest. Node 26 is installed here and runs TypeScript natively, so
  every stage can be built, tested and played in a browser on this machine.

Alternatives considered:
- **Unity or Unreal:** higher graphics ceiling, but a heavy download for players, separate netcode stacks, and neither
  is installed here to verify builds.
- **Godot 4:** lighter, but its web export and multiplayer are less proven at this scale, and it isn't installed here.
- **Babylon.js:** comparable to Three.js with more built-in engine features. Three.js was chosen for its simpler core
  and ecosystem.

Accepted trade-off: the visual ceiling is below Unreal/Unity. Mitigations are LOD, budgets and targeted shaders (§15).

## 5. Technical architecture

### 5.1 Layers

```
┌──────────────────────── client (browser) ────────────────────────┐   ┌──────── server (Node) ────────┐
│ ui · hud · camera · render · audio · input                       │   │ http static / vite middleware  │
│              │ reads snapshots of world state                    │   │ rooms · connections · tick loop│
│         GameSession interface ───────────────────────────────────┼──▶│ (M2+)                          │
│   LocalSession (M1: World runs in the browser)                   │   │   World runs here              │
│   NetworkSession (M2+: prediction + interpolation over WebSocket)│   │                                │
└──────────────────────────────────────────────────────────────────┘   └────────────────────────────────┘
                 both import  src/shared  (pure TypeScript, no DOM or Node APIs)
   data (aircraft, weapons, maps) · physics · weapons · targeting · damage · ai · map · modes · world · net
```

The renderer, HUD and input depend only on the `GameSession` interface. M1 uses `LocalSession`; M2 adds
`NetworkSession` without changing gameplay code.

### 5.2 Systems

| System (from the brief) | Location | Responsibility |
|---|---|---|
| Flight physics | `src/shared/physics/` | Atmosphere, aerodynamic coefficients, forces, fly-by-wire control laws, integration |
| Aircraft configuration | `src/shared/data/aircraft/` | One data file per aircraft, types, registry, validation |
| Weapons | `src/shared/weapons/` + `src/shared/data/weapons.ts` | Cannon projectiles, missiles and guidance, countermeasures, lead solution |
| Targeting | `src/shared/targeting/` | Visual detection, radar and stealth, IR seeker, target designation, locks, warnings |
| Damage | `src/shared/damage/` | Hit points, damage states and their effects, destruction |
| AI | `src/shared/ai/` | Steering primitive, bot pilot behaviors, difficulty profiles |
| Multiplayer/networking | `src/shared/net/`, `src/server/`, `src/client/session/` | Protocol and codecs, authoritative rooms, prediction and interpolation |
| UI | `src/client/ui/`, `src/client/hud/` | Menus, overlays, settings, fighter HUD, radar display |
| Audio | `src/client/audio/` | WebAudio-synthesized engine, weapons, tones and warnings |
| Maps | `src/shared/map/`, `src/shared/data/maps/`, `src/client/render/terrain/` | Terrain generation and sampling, features (settlements, roads, airfields), map definitions, terrain rendering |
| Game modes | `src/shared/modes/` | A `GameMode` interface plus TDM, Air Superiority, Team Objective, Free Flight |
| World | `src/shared/world/` | Entities, the fixed-step simulation, events, spawning |

### 5.3 Conventions

- **Units:** SI internally (m, s, kg, N, rad). The HUD converts for display (knots/feet for USA aircraft, km/h/meters
  for Russia aircraft; switchable in settings).
- **World frame:** right-handed, y-up. `+x` = east, `+y` = up, `-z` = north. Map origin at the map center, sea level.
- **Body frame:** forward = `-z_b`, up = `+y_b`, right = `+x_b`. Angular velocity is expressed in the body frame.
- **Control input:**
  - `pitch +1` = nose up, `roll +1` = roll right, `yaw +1` = nose right.
  - `throttle` ∈ [0, 1] (> 0.9 = afterburner).
  - Buttons: cannon, missile, countermeasures, airbrake, target cycle, weapon select, helmet sight.
- **TypeScript:** `strict`; **erasable syntax only** (no `enum`, `namespace`, parameter properties) so Node 26
  runs `.ts` directly; relative imports use explicit `.ts` extensions; `import type` for type-only imports.
- **Determinism:** shared simulation functions are pure given (state, input, dt, seeded RNG). All randomness comes from
  the World's seeded RNG.

## 6. Folder structure

```
DOG/
├── index.html · package.json · tsconfig.json · vite.config.ts · README.md · .gitignore · Dockerfile (M5)
├── docs/superpowers/{specs,plans}/
└── src/
    ├── shared/
    │   ├── math/            units, rng, noise, vector helpers
    │   ├── data/
    │   │   ├── aircraft/    types.ts, registry.ts, validate.ts, one file per aircraft (kestrel.ts, kobchik.ts, …)
    │   │   ├── weapons.ts   cannons, missiles, countermeasures (abstract parameters)
    │   │   └── maps/        test-range.ts (M1), lechovia.ts (M4)
    │   ├── physics/         atmosphere.ts, aero.ts, flight-model.ts, controls.ts
    │   ├── weapons/         cannon.ts, missile.ts, countermeasures.ts, lead.ts
    │   ├── targeting/       sensors.ts, radar.ts, ir-seeker.ts, designation.ts
    │   ├── damage/          damage.ts
    │   ├── ai/              steering.ts, bot-pilot.ts, difficulty.ts
    │   ├── map/             terrain.ts (GridTerrain), generators, features
    │   ├── modes/           mode.ts, team-deathmatch.ts, free-flight.ts, air-superiority.ts, team-objective.ts
    │   ├── world/           world.ts, entities.ts, events.ts, spawns.ts
    │   └── net/             protocol.ts, codecs (M2)
    ├── server/              main.ts, config.ts, rooms, connections, static http (M2)
    └── client/
        ├── main.ts
        ├── session/         game-session.ts, local-session.ts, network-session.ts (M2)
        ├── input/           keyboard, mouse-aim, gamepad (M5) → ControlInput
        ├── render/          renderer, sky, terrain/, models/, effects/, clouds (M4)
        ├── camera/          camera-rig.ts (HUD, cockpit, chase, free), transitions, shake
        ├── hud/             hud.ts, layers (flight, weapons, radar display, warnings), units
        ├── ui/              menus, overlays, settings
        └── audio/           synthesized sounds
```

Tests are colocated as `*.test.ts`.

## 7. Multiplayer architecture (M2)

- **Topology:** one Node process serves the client (Vite middleware in dev, static `dist/client` in prod) and a
  WebSocket at `/ws?room=<name>` on one port (default 8080). LAN players open `http://<host-ip>:8080`; the server prints
  its LAN URLs.
- **Authority:** the server runs the `World` at a fixed 60 Hz. It is the only authority for:
  - hits and damage;
  - locks and missile guidance;
  - ammunition and cooldowns;
  - scoring, objectives and respawns.
  Clients send only control inputs.
- **Client → server:** a compact binary input every client tick (60 Hz): `seq`, stick/throttle, buttons, selected weapon,
  head direction for the helmet sight, and `viewDelay` (ticks between the predicted tick and the tick others were
  rendered at).
- **Server → client:**
  - Binary snapshots at 30 Hz. Per jet: id, flags, hp, throttle, position (f32), orientation (quantized quaternion),
    velocity (quantized). Also missiles, and a per-client section with the full-precision own state for
    reconciliation, ammo/stores, lock and warning state, and `ackSeq` and input-queue depth.
  - JSON events for kills, hits, launches, detonations, countermeasures, mode status, roster and scores.
- **Prediction and reconciliation:**
  - The client simulates its own jet with the shared flight model.
  - On each snapshot it resets to the authoritative state and replays unacknowledged inputs.
  - Visual corrections decay smoothly (τ = 0.1 s); a respawn is a hard reset.
- **Interpolation:** other entities render 100 ms in the past, Hermite for position and slerp for orientation;
  extrapolation is capped at 200 ms.
- **Clocks and queues:** ping/pong every 2 s; minimum-RTT sample in a sliding window.
  - One input queue per player; one input consumed per tick (the last is repeated if empty).
  - The client nudges its tick rate ±2% to keep the queue about 2 deep.
- **Lag compensation:** a 1 s position history per jet. Cannon hit tests rewind targets by the shooter's `viewDelay`
  (capped at 250 ms, only within the same life). Missiles, collisions and objectives are not rewound.
- **Rooms and capacity:**
  - The first join creates a room and fixes its mode, map and bot settings.
  - 16 humans per room and 20 rooms per process (configurable).
  - Bots fill each team to a configurable size (default 4). Callsigns are sanitized and bots are prefixed `[BOT]`.
- **Validation:** clamp all input values; cap message sizes (binary 64 B, JSON 2 KB) and rates (120 inputs/s).
  Three protocol violations within 10 s → disconnect. A disconnect affects only that player.
- **Bandwidth:** ≤ 50 KB/s down and ≤ 1 KB/s up per client with 32 jets.
- **Exact byte layouts** are defined in the M2 plan and include the M3 fields (radar missile, chaff, weapon select)
  from the start.
- **Debugging:** `?lag=<ms>&jitter=<ms>` simulates latency; `?debug=1` shows FPS, RTT, queue depth, prediction error,
  α, n, Mach.

## 8. Flight-model approach

`stepFlight(state, input, config, dt)`, semi-implicit Euler at `dt = 1/60 s`.
State: `{pos, vel, quat, angVel, throttle, airbrake}`, plus derived `alpha, beta, gLoad, mach`.

**Atmosphere (ISA)** — altitude effects:
- 0–11 km: `T = 288.15 − 0.0065h`, `ρ = 1.225(T/288.15)^4.2559`.
- 11–20 km: `T = 216.65`, `ρ = 0.36392·e^{−(h−11000)/6341.6}`.
- `a = 20.0468√T`.

**Air data:**
- `q̄ = ½ρV²`, `M = V/a`.
- Velocity in the body frame `v_b = quat⁻¹·vel`.
- `α = atan2(−v_b.y, −v_b.z)`, `β = atan2(v_b.x, −v_b.z)`.

**Coefficients** (all per-aircraft data):
- `CL(α)`: linear `CLα·α` to `α_max`. Past `α_max` it drops 40% over 15°, then follows a flat-plate `1.05·sin 2α`;
  symmetric for negative α.
- `CD = CD0·W(M) + K·(1 + 0.8·max(0, M − 1))·CL² + 1.5·sin²(max(0, |α| − α_max)) + 0.5·β² + 0.08·airbrake`.
  `W(M)` is a transonic wave-drag factor: 1.0 below M 0.85, peak 2.2 at M 1.05, 1.6 from M 2.0.
- Side force `CY = −1.0·β`.

**Forces:**
- Lift along `normalize(right × v̂)`; side force along `normalize(v̂ × liftDir)`; drag along `−v̂`.
- Thrust along body forward: `T(throttle)·σ^0.75·(1 + 0.2·M·(1 − σ))` with `σ = ρ/1.225`.
  - Throttle 0–0.9 maps idle (5% of military) → military; 0.9–1.0 maps military → full afterburner.
  - Spool time constant 0.6 s. The damage state scales thrust (§11).
- Gravity.

**Rotation (fly-by-wire):**
- **Pitch:** the stick commands a load factor.
  - Neutral = `n_trim = liftDir.y` (holds the flight path; −1 G when inverted); full aft = `n_max`; full forward = `n_min`.
  - `α_cmd = clamp(n_cmd·m·g/(q̄·S·CLα), −10°, α_limiter)`.
  - Pitch rate `= (acc·liftDir)/V + k_α·(α_cmd − α)`, clamped to the max pitch rate.
  - Result: G-limited at high speed and lift-limited at low speed, so turning is speed-dependent and a corner speed
    emerges. `α_limiter` sits just past `α_max`, so a low-speed pull stalls and mushes.
- **Roll:** about the velocity vector (stability axis). Rate `= roll·p_max·authority`, reduced by up to 50% between α 15°
  and 30°.
- **Yaw:** a feed-forward keeps the nose on the velocity vector (coordinated flight), plus a sideslip controller toward
  `β_cmd = −yaw·6°`.
- **Authority:** `authority = clamp(q̄/5 kPa, 0.05, 1)`. Thrust-vectoring aircraft add `tvc·thrustFraction` to pitch/yaw
  authority and have higher AoA limiters (supermaneuverability).
- **Lags:** body rates follow commands with first-order lags (pitch 0.05 s, yaw 0.08 s, roll 0.12 s). The quaternion is
  integrated from body rates and renormalized every step.
- **Airbrake** deploys and stows over 1 s.
- **Crash rule:** ground/sea contact when `pos.y < surfaceAt(x, z) + 2 m`, where `surfaceAt = max(heightAt, 0)` (sea at 0 m).
- **Derived outputs** for HUD and effects: `gLoad = ((F_aero + F_thrust)/m · up_b)/g`, Mach, α, β.
- **Visual effects tied to the model:** camera shake and effects use G-load, the transonic buffet band (M 0.95–1.05),
  afterburner and speed.
- **Ground handling (M4, runway spawns):** gear contact springs, rolling/brake friction, nose-wheel steering; takeoff
  when lift exceeds weight.
- **Not modeled:** fuel burn, spins/departures, wind, landing gear damage.

## 9. Aircraft roster (fictional, data-driven)

### 9.1 Data-driven configuration

Each aircraft is one `AircraftConfig` data object in `src/shared/data/aircraft/<id>.ts`, registered in `registry.ts`.

| Section | Contents |
|---|---|
| identity | id, name, team, role, description, "inspired by" note (docs only) |
| physics | mass, wing area, military/afterburner thrust, CD0, K, CLα, `α_max`, AoA limiter, G limits, max pitch/roll/yaw rates, thrust vectoring (0–1) |
| sensors | radar range and cone, stealth (0–1), IR signature multiplier, special traits (helmet sight, two-seat crew) |
| stores | cannon type and rounds, SRM count, MRM count, countermeasure salvos |
| damage | hit points, hit radius |
| visual | parametric model spec (fuselage, wing planform, tail type, intakes, nozzles, canards), livery colors |
| hud | default units |
| performance | target ranges (top speed at 11 km and sea level, instantaneous turn rate, 1 G stall speed), verified by tests |

- `validateAircraftConfig` checks ranges and consistency, and runs in the test suite for every registered aircraft.
- The parametric model builder turns `visual` into a mesh, so a new aircraft needs no new code.

### 9.2 Roster

All names and numbers are fictional. The "inspired by" column is for design reference only and is never shown in game.

| Team | Name | Inspired by | Role | Strengths | Weaknesses |
|---|---|---|---|---|---|
| USA | **Shade** | F-35 | Stealth multirole | Highest stealth, longest-range sensors, faster radar locks | Lowest thrust-to-weight, low top speed, internal stores only (2 SRM + 4 MRM), 180 cannon rounds |
| USA | **Tempest** | F-22 | Stealth air superiority | High stealth, supercruise, best acceleration, pitch thrust vectoring | Lowest hit points, internal stores only (2 SRM + 4 MRM), fewest countermeasures |
| USA | **Kestrel** | F-16 | Light multirole | Best roll rate, strong acceleration, agile at high speed | Low hit points, small radar, 4 SRM + 2 MRM |
| USA | **Condor** | F-15 | Heavy air superiority | Fastest, big radar, 4 SRM + 4 MRM, 940 rounds, high hit points | No stealth, larger turning circle |
| Russia | **Prizrak** | Su-57 | Stealth fighter | Moderate stealth, 3-D thrust vectoring, widest radar cone | Internal stores only (2 SRM + 4 MRM), 150 cannon rounds |
| Russia | **Yastreb** | Su-35 | Supermaneuverable heavy | Best low-speed agility (3-D thrust vectoring), biggest payload (4 SRM + 6 MRM) | No stealth, bleeds energy in sustained turns |
| Russia | **Sapsan** | Su-30 | Two-seat multirole | Two-seat crew: fastest locks, most hit points, 4 SRM + 6 MRM | Lowest acceleration, no stealth |
| Russia | **Kobchik** | MiG-29 | Light fighter | Helmet sight: widest SRM off-boresight and fastest SRM lock; strong low-speed turn | Smallest radar, 4 SRM + 2 MRM, low hit points |

### 9.3 Initial physical parameters (tuned against performance targets in tests)

| | Shade | Tempest | Kestrel | Condor | Prizrak | Yastreb | Sapsan | Kobchik |
|---|---|---|---|---|---|---|---|---|
| Mass (kg) | 21,000 | 27,000 | 12,000 | 20,500 | 26,000 | 25,000 | 26,500 | 15,000 |
| Wing area (m²) | 43 | 78 | 28 | 56 | 78 | 62 | 62 | 38 |
| Thrust mil / AB (kN) | 120 / 195 | 225 / 315 | 76 / 130 | 128 / 212 | 185 / 300 | 170 / 285 | 150 / 250 | 100 / 165 |
| CD0 / K | .024 / .14 | .019 / .11 | .020 / .13 | .021 / .12 | .020 / .11 | .022 / .12 | .023 / .13 | .022 / .13 |
| CLα (/rad) / α_max / AoA limiter (°) | 4.0 / 26 / 28 | 4.1 / 28 / 30 | 4.2 / 25 / 26 | 3.9 / 25 / 26 | 4.1 / 28 / 38 | 4.1 / 28 / 38 | 4.0 / 26 / 28 | 4.2 / 26 / 28 |
| Thrust vectoring | 0 | 0.5 (pitch) | 0 | 0 | 1 | 1 | 0 | 0 |
| Max roll (°/s) | 200 | 240 | 280 | 210 | 250 | 220 | 190 | 250 |
| Hit points | 100 | 85 | 80 | 120 | 95 | 115 | 130 | 85 |
| Radar range (km) / cone (±°) | 60 / 60 | 50 / 60 | 35 / 60 | 55 / 60 | 50 / 75 | 55 / 60 | 60 / 60 | 30 / 60 |
| Stealth | 0.85 | 0.80 | 0.15 | 0 | 0.60 | 0.05 | 0 | 0.15 |
| SRM / MRM | 2 / 4 | 2 / 4 | 4 / 2 | 4 / 4 | 2 / 4 | 4 / 6 | 4 / 6 | 4 / 2 |
| Cannon / rounds | RC-25 / 180 | RC-20 / 480 | RC-20 / 510 | RC-20 / 940 | HC-30 / 150 | HC-30 / 150 | HC-30 / 150 | HC-30 / 150 |
| Countermeasure salvos | 24 | 24 | 40 | 60 | 30 | 60 | 60 | 40 |

G limits are +9 / −3 for all. Performance targets per aircraft live in the data files. Example for Kestrel: top speed
M 1.9–2.3 at 11 km and M 1.1–1.4 at sea level; instantaneous turn 20–27 °/s at 170 m/s and 1 km; 1 G stall 50–75 m/s.

### 9.4 Balance process

- A seeded bot-vs-bot tournament runs in tests (M3): every aircraft pairing, ace bots, a neutral head-on merge,
  50 seeds per pairing.
- Each pairing's win rate must be 35–65%. If one isn't, adjust that aircraft's data file (never the flight code) and
  re-run.

## 10. Weapons, targeting and countermeasures (abstracted)

Weapons are gameplay abstractions with fictional names. No real-world construction, performance data or operational
procedures are modeled.

### 10.1 Cannons

Projectiles inherit the shooter's velocity and feel gravity and drag. Each simulated projectile represents several
rounds to keep entity counts low. Hit test: the projectile's swept segment against each enemy's hit sphere (lag-
compensated in multiplayer). There is no friendly fire.

| | RC-20 (rotary, light) | RC-25 (rotary, medium) | HC-30 (single barrel, heavy) |
|---|---|---|---|
| Rounds/s (projectiles/s × rounds each) | 100 (25 × 4) | 55 (18 × 3) | 30 (15 × 2) |
| Muzzle velocity (m/s) | 1,030 | 1,000 | 880 |
| Damage per projectile | 10.4 | 14.0 | 17.4 |
| Dispersion σ (mrad) | 2.5 | 3.0 | 3.5 |
| Lifetime (s) | 3 | 3 | 3 |

**Lead marker** (a shared function used by the HUD and bots): iterate the time of flight `t` three times,
then aim direction `= normalize(Δp + Δv·t + ½g·t²·ŷ)`.

### 10.2 Missiles

| | SRM "Dart" (infrared) | MRM "Lance" (radar, M3) |
|---|---|---|
| Needs | IR seeker lock | Radar lock on a radar contact |
| Seeker acquisition cone | 10° half-angle around the designated target, nose, or helmet-sight direction | n/a (the launcher's radar) |
| Off-boresight limit | ±60° (±75° with helmet sight) | inside the launcher's radar cone |
| Lock time | 0.8 s (×0.7 with helmet sight) | 1.5 s (×0.7 two-seat, ×0.8 sensor fusion) |
| Lock range | 9 km tail aspect, 4 km head-on, ×1.3 vs afterburner | the launcher's radar detection range for that target |
| Guidance | proportional navigation (N = 4), 40 g limit | launcher-supported mid-course (target must stay in radar cone), independent when within 10 km × (1 − 0.5·stealth); 30 g limit |
| Motor | 150 m/s² for 5 s | 110 m/s² for 8 s |
| Max flight time | 25 s | 60 s |
| Countermeasure | flares: 35% decoy chance per salvo (×0.5 if the target is on afterburner) | chaff: 30% break chance per salvo (×1.3 vs stealthy targets) |
| Blast | 130 damage ≤ 4 m, linear to 0 at 18 m; proximity fuze 9 m | same |

- **Common rules:**
  - Minimum interval between launches: 1 s (SRM) and 2 s (MRM).
  - The fuze uses closest approach within each tick, so fast closure never tunnels.
  - Missiles lose their target on leaving the seeker limit, terrain occlusion, or a successful countermeasure roll;
    they then fly ballistic.
  - Self-destruct below 250 m/s after burnout or at max flight time.
  - Missile drag: `C·ρ·V²` plus maneuver drag `0.08·|a_lat|`.
- **Countermeasures:** one key releases a salvo (one flare plus one chaff). Each missile guiding on that aircraft
  rolls once per salvo against the matching countermeasure. Flares burn 3 s; chaff lasts 4 s.

### 10.3 Targeting and sensors

- **Visual:** aircraft within 6 km (8 km on afterburner) with terrain line of sight are spotted and shown on the HUD.
- **Radar** (scans at 5 Hz):
  - Detects aircraft inside the radar cone within `radarRange × (1 − 0.7·targetStealth)`.
  - Contacts appear on the radar display. Teammates' radar contacts are shared via team datalink (shown distinctly,
    and not lockable).
- **Designation:** the target-cycle key cycles through spotted and radar contacts ahead, sorted by angle and range.
  The designated target gets the target box and the target-info readout (type, range, closure, aspect).
- **IR seeker (SRM)** has states `SEARCH → TRACK (growl) → LOCKED (tone)`, evaluated at 20 Hz.
  - It looks toward the designated target when that is inside the off-boresight limit; otherwise along the nose, or
    along the helmet-sight direction when active.
  - Its lock is kept while the target stays inside the limit, within 1.2× range, and visible.
- **Radar lock (MRM):** the designated target must be an own-radar contact inside the cone. Lock builds over the lock
  time and is kept while detected.
- **Warnings:**
  - `LOCK` when an enemy radar lock is on you.
  - `MISSILE` (with bearing) when an SRM guiding on you is within 3 km, or an MRM guiding on you is active or within
    15 km.

## 11. Damage model

- **Hit points** per aircraft (§9.3). Cannon damage is per projectile; missile blast uses distance falloff (§10.2).
- **Damage states:**

| State | HP | Effects |
|---|---|---|
| Healthy | ≥ 60% | none |
| Damaged | 30–60% | smoke, thrust ×0.9 |
| Critical | < 30% | fire trail, thrust ×0.75, roll rate ×0.7 |
| Destroyed | ≤ 0 | explosion |

- **Credit:** the kill goes to the last enemy who damaged the aircraft. A crash within 15 s of enemy damage or an
  enemy lock credits that enemy ("maneuver kill"); otherwise the death is uncredited.
- **Other deaths:**
  - Mid-air collision (centers closer than `0.5·(r₁ + r₂)`) destroys both aircraft.
  - Leaving the combat area, or climbing above 18 km, for 15 s continuous → destroyed.
- **Respawn:** after 5 s, per the mode's spawn rules, with full stores.

## 12. Maps

### 12.1 Terrain core (all maps)

- **`GridTerrain`:** a height grid (Float32) with bilinear `heightAt(x, z)`, `surfaceAt = max(heightAt, 0)`,
  `normalAt`, and a line-of-sight test that samples every 250 m.
- **Deterministic generation** from a seed. The server, the client physics and the terrain renderer all use the same
  grid, so collisions match the visuals.
- **Features** layers generated from the same seed: water, land cover, settlements, roads, airfields.

### 12.2 Test range (M1)

- 60 × 60 km, grid 512² (~117 m cells).
- **Terrain:** rolling farmland in the center, a lake, a river valley, a hill ridge in the south rising to about
  1,200 m, and sea along the north edge.
- **Shading:** vertex colors by height, slope and land cover (fields, forest, rock, sand).
- **Combat area:** a 25 km radius circle.
- **Spawns:** the two teams spawn airborne 15 km apart, facing each other.

### 12.3 Lechovia (M4)

200 × 200 km, grid 2048² (~98 m cells), rendered with quadtree LOD chunks built in a Web Worker.

- **Geography inspired by Poland:**
  - **North:** a sea coast with beaches, a sand spit and a lagoon.
  - **Northeast:** a lake district of forested moraine hills and dozens of lakes.
  - **Center:** broad plains of strip fields, woods and villages. A great river runs from the southern mountains north
    to the sea, with the capital on its banks; a second river runs along the west.
  - **South:** foothills, then a mountain range along the southern edge, with peaks to about 2,400 m and valleys.
  - **East:** large forests and marshes.
- **Places:** all fictional.
  - About 5 cities with curated fictional names, and about 60 villages with names generated from Polish-like
    syllables (checked against a list of real major cities).
  - Roads: highways between cities and local roads to villages, routed over terrain cost.
  - **Military airfields** (fictional, with runways, taxiways, hangars and a tower): one per team at the west and east
    edges, and two neutral ones.
- **Rendering:**
  - Terrain shading: strip fields, forests, urban tint, rock and snow on high slopes.
  - Water: the sea plane; rivers and lakes via water-flagged terrain vertices.
  - Settlements: instanced buildings per settlement.
  - Roads: ribbons.
- **Weather presets:** clear, scattered, broken, overcast (+ light rain). They drive cloud-layer coverage and altitude,
  fog density and light. Clouds block visual detection and IR locks.
- **Day/night:**
  - Time of day is a room setting and advances at a configurable rate (default 1 game hour per real minute; can be
    frozen).
  - The sky, sun and moon, stars and ambient light follow it.
  - At night: city lights, runway lights, aircraft navigation lights and a dimmer HUD.

## 13. Game modes

All modes implement `GameMode`: setup, per-tick update, scoring on events, spawn rules, win conditions, and HUD status.

| Mode | Rules | Milestone |
|---|---|---|
| **Free Flight** | No scoring or enemies (optional passive AI targets); spawn anywhere; time-of-day and weather controls; free camera encouraged | M1 |
| **Team Deathmatch** | +1 per enemy kill; each death of a team's aircraft gives the other team +1; first to 15 or most after 10 min | M1 (vs AI), M2 (online) |
| **Air Superiority** | Three capture zones (cylinders, 4 km radius, 1–7 km altitude) along the front. A zone's capture progress moves toward the team with more aircraft inside (rate ∝ numeric advantage, 10 s to capture with +1). Each owned zone gives +1 point every 2 s. First to 300 or most after 12 min | M5 |
| **Team Objective** | Each team protects two AI-flown high-value "Sentinel" radar aircraft (slow, 400 HP) orbiting behind its lines. Destroying one gives +20 and cuts the enemy team's datalink for 60 s; kills give +1; destroyed Sentinels return after 120 s. First to 60 or most after 15 min | M5 |

**Spawning:** airborne at the team's spawn line (5,000 m, 250 m/s, facing the front) or, from M4, at the team's airfield
on the runway, as the player chooses.

## 14. AI

- **`BotPilot`** (shared, pure) maps a perception to a `ControlInput`, the same interface humans use, so bots obey the
  same physics.
  - Perception is world truth, delayed by the difficulty's reaction time and filtered by the bot's own sensors.
- **Steering primitive:** `steerToward(state, desiredDirection)`. It banks until the target direction lies in the lift
  plane, pulls, and uses rudder and wing-leveling for fine alignment. The same function drives the human mouse-aim mode.
- **Behavior priority** (highest first):
  1. **Ground avoidance:** if the flight path predicted 5 s ahead gets closer than 150 m to the surface, pull up.
  2. **Boundary:** turn back inside the area.
  3. **Defend:** a missile is guiding on the bot → beam it, pull hard, release countermeasures while it is inside 3 km.
  4. **Engage:**
     - Choose a target. Fire MRM within 60% of the lock range, SRM within 0.5–7 km, at most one missile per target
       per 5 s.
     - Lead pursuit with the cannon inside gun range, firing when the aim error is under the threshold.
  5. **Patrol:** fly toward the nearest enemy or the area center.
  6. **Energy:** afterburner in combat; ease the pull below corner speed.
- **Difficulty profiles:**

| | Rookie | Veteran | Ace |
|---|---|---|---|
| Reaction delay | 0.8 s | 0.4 s | 0.15 s |
| Aim noise | 3° | 1.5° | 0.5° |
| Max pull used | 70% | 85% | 100% |
| Countermeasure discipline | 0.4 | 0.8 | 1.0 |
| Gun range | 500 m | 700 m | 900 m |
| Fire threshold | 2.5° | 1.5° | 0.8° |

- **Mode-specific AI:** Sentinel aircraft (Team Objective) fly orbits and flee threats; bots contest zones in Air
  Superiority.

## 15. Client

### 15.1 Cameras

| Camera | Description |
|---|---|
| HUD view | First-person at the pilot's eye with the HUD only; the default |
| Cockpit | First-person with a simple procedural cockpit (canopy frame, panel, HUD glass) (M5) |
| Chase | Third-person behind and above, smoothed follow |
| Free camera | Detached fly-cam for testing (WASD + mouse, Shift fast) |

- **Padlock / free look:** looking at a target sets the helmet-sight direction.
- **Transitions:** 0.35 s smoothstep blends of position, orientation and FOV between rigs.
- **Shake:** trauma-based noise from G > 6, the transonic buffet band, afterburner, cannon fire, hits and nearby
  explosions. It decays over time, and a "reduce motion" setting scales it.

### 15.2 HUD (Canvas 2D, clean green; amber/white option)

- **Flight:** airspeed, altitude, heading tape, throttle and afterburner, G (current and max), Mach, AoA, pitch
  ladder, flight-path marker.
- **Aircraft status:** HP and damage state, airbrake, stall warning, pull-up warning.
- **Weapons:** selected weapon, remaining cannon rounds, SRM, MRM and countermeasures. Gun boresight cross and lead
  marker on the designated target within 2 km.
- **Targeting:**
  - Target box and target info (type, range, closure, aspect); lock status (SRCH / TRK / LOCK).
  - Contact markers (friendly blue, enemy red) and off-screen arrows.
- **Warnings:** `LOCK` and `MISSILE` with a bearing arrow.
- **Radar display:** a top-down scope, heading-up, with range scales 10 / 20 / 40 / 80 km. It shows own-radar contacts,
  datalink contacts and missiles in flight.
- **Game:** mode status (scores, zones, time), kill feed, hit markers, scoreboard (Tab), map (M), respawn countdown.
- **G effects:** blackout vignette when > 7 G is sustained for more than 2 s; red tint below −2.5 G.

### 15.3 Controls

- **Mouse-aim (default):** the mouse sets an aim direction and `steerToward` flies the jet there; the keyboard adds on top.
- **Keyboard direct:** W/S pitch, A/D roll, Q/E yaw, with input ramping over 0.15 s.
- **Gamepad:** standard mapping (M5).

| Key | Action |
|---|---|
| Shift / Ctrl, mouse wheel | Throttle |
| Space | Cannon |
| F | Fire missile |
| 1 / 2 | Select SRM / MRM |
| R | Cycle target |
| X | Countermeasures |
| B | Airbrake |
| V | Padlock |
| C | Cycle camera |
| Tab | Scoreboard |
| M | Map |
| Esc | Pause |

### 15.4 Graphics

- **M1 prototype:**
  - Procedural parametric aircraft models; vertex-colored terrain; Three.js `Sky` shader with fog.
  - Simple effects: afterburner, tracers, missile trails, flares, explosions, smoke.
- **M4/M5 target (a modern military-sim look):**
  - Lighting: PBR aircraft materials; shadows near the camera; bloom for afterburners and explosions.
  - Atmosphere: haze and height fog with aerial perspective; cloud layers.
  - Effects: contrails above 8 km, wingtip vapor above 5 G, refined explosions and missile smoke.
  - Night lighting.
- **Budget:** < 400 draw calls and < 2 M triangles per frame.

### 15.5 UI and audio

- **Menus:** callsign, team and aircraft selection (cards with stats derived from the data files), mode, map, time of
  day, weather, bots, difficulty.
- **Other screens:** loading, pause/settings, death/respawn (killer, weapon, countdown, aircraft change), match end.
- **Settings** persist in `localStorage` (try/catch, defaults if unavailable).
- **Audio:** WebAudio-synthesized, no asset files.
  - Engine and afterburner, wind, cannons.
  - SRM growl and lock tone, radar lock warning, missile warning, explosions and hits.
  - Master volume.

## 16. Server (M2)

- **`main.ts`:** config from env/CLI (`PORT` 8080, `HOST` 0.0.0.0, `MAX_ROOMS` 20, `MAX_HUMANS_PER_ROOM` 16, bot and
  mode defaults); HTTP static or Vite middleware; `ws` at `/ws`; LAN URL printout.
- **`RoomManager`:** creates and closes rooms (a room closes 30 s after the last human leaves).
- **`Room`:** owns a `World`, player↔aircraft mapping, input queues, snapshot encoding, event fan-out and history.
- **Tick loop:** a process-wide fixed-step accumulator.
  - Each room's step is isolated in try/catch; 3 consecutive failures close the room.
- **Shutdown:** SIGINT/SIGTERM broadcast `serverShutdown`, then close.

## 17. Error handling

| Situation | Behavior |
|---|---|
| WebGL unavailable | Friendly message with browser guidance |
| WebSocket drops (M2) | "Connection lost" overlay; 3 automatic reconnects (1/2/4 s), then a Reconnect button |
| Join rejected | The menu shows the server's message and keeps the form values |
| Malformed or abusive client | Violations counted → disconnect; server unaffected |
| Exception inside a simulation step | Logged; the offending entity is removed if identifiable; the room/session continues; 3 consecutive failures stop it with a visible error |
| Invalid aircraft data file | `validateAircraftConfig` fails the test suite and throws at registration with the aircraft id and field |

## 18. Performance budgets

| Area | Budget |
|---|---|
| Client frame | 60 fps at 1080p on a 2020+ laptop; < 400 draw calls; < 2 M triangles |
| Terrain chunk build (worker, M4) | < 4 ms per chunk |
| World step | < 2 ms with 32 aircraft (server and local) |
| Network per client | ≤ 50 KB/s down, ≤ 1 KB/s up |
| Initial download | < 5 MB (maps are generated from seeds, not downloaded) |

## 19. Testing strategy

Test-driven development with Vitest: write the failing test first for all logic in `src/shared/`, `src/server/`
and the pure parts of `src/client/`. Rendering, feel and visuals are verified by running the game in the browser
pane at each stage.

- **Atmosphere:** ρ, T and a at 0 / 5 / 11 / 15 km within 1% of ISA tables.
- **Flight model** (every registered aircraft):
  - Level trim holds altitude within 30 m over 10 s.
  - Full aft stick at 300 m/s: peak n in [8.0, 9.5]. Low speed is lift-limited; very low speed sinks.
  - Roll rate reaches 80% of max within 0.5 s.
  - 60 s of random inputs never produces NaN; identical inputs give identical states.
  - Each aircraft's performance targets (§9.3) are met.
- **Weapons:**
  - Ballistics and damage; the lead-marker solution hits a constant-velocity target.
  - Proportional navigation hits a non-maneuvering target and runs out of energy at long range.
  - Fuze closest-approach math.
  - Countermeasure rates over 1,000 seeded trials within ±5% of expected.
- **Targeting:**
  - Radar detection range vs stealth; seeker range vs aspect and afterburner.
  - Terrain occlusion; lock build-up and loss; designation order.
- **Damage:** state thresholds and effects; kill credit, including maneuver kills and collisions.
- **Map:**
  - Terrain determinism and bilinear sampling; `surfaceAt` over the sea; line of sight.
  - (M4) Feature placement: airfields flat, villages not in water, roads connected.
- **Modes:** scoring, win conditions, zone capture math, Sentinel rules, spawn placement.
- **AI:**
  - Steering converges on a direction (< 3° within 5 s); ground avoidance recovers from a low dive.
  - Fires only when aligned; defends against inbound missiles.
  - Ace beats rookie in > 80% of seeded 1v1s.
- **Balance (M3):** the tournament per §9.4.
- **Networking (M2):**
  - Codec round-trips and quantization bounds; garbage input raises a typed error.
  - Prediction converges under simulated latency; interpolation limits.
  - Server integration tests with real `ws` clients: join, snapshots, inputs, hit/kill/respawn, room full,
    protocol-violation disconnect.
- **Client logic:** input mapping, camera blend math, HUD math and unit formatting, fixed-step accumulator.
- **Gate:** `npm test` and `npm run build` (type-check + client build) pass before every commit.
  `src/shared/` line coverage ≥ 80%.

## 20. Development milestones

Each milestone has its own implementation plan in `docs/superpowers/plans/` and ends runnable. The order follows the
brief (§11 of the brief: steps 1–11).

| # | Milestone | Brief steps | Scope | Accepted when |
|---|---|---|---|---|
| M1a | **Fly** | 1–6 (+ basic HUD) | Scaffold; math; atmosphere; data-driven aircraft config (Kestrel); flight model; steering; test-range terrain; local World and session; renderer, sky, terrain mesh, parametric model; keyboard + mouse-aim; HUD and chase cameras with transitions/shake; free camera; basic flight HUD; start menu with Free Flight | One aircraft is flyable at 60 fps; stall, G-limit, energy bleed and altitude effects observable; tests green |
| M1b | **Fight** | 7–9 | Second aircraft (Kobchik) as the AI opponent; cannon + lead; SRM + IR seeker; flares; basic radar detection and designation; damage model; destruction and respawn; Team Deathmatch vs 1 AI; bot pilot; effects (tracers, missile trails, flares, explosions, smoke); full combat HUD (target info, lock, missile warning, radar display, ammo, kill feed); minimal audio | A 1v1 dogfight against the AI is playable end to end with both weapons and countermeasures |
| M2 | **Multiplayer** | 10 | Node server, rooms, protocol and codecs, authoritative World, NetworkSession (prediction, reconciliation, interpolation, clock sync, lag compensation), lobby (team + aircraft), bots fill, LAN URLs, lag simulator | Two tabs plus a second LAN machine fight each other smoothly at `?lag=150`; integration tests green |
| M3 | **Roster & weapons** | 11 | The remaining 6 aircraft (data + parametric models); radar/stealth model; MRM "Lance" + chaff; RWR `LOCK` warning; damage states; balance tournament | All 8 aircraft selectable; tournament win rates within 35–65% |
| M4 | **World** | 11 | Lechovia map (terrain LOD in worker, geography, settlements, roads, airfields), runway spawns with ground handling, clouds and weather, day/night cycle | Take off from a fictional airfield and fight over recognizable Poland-inspired terrain at 60 fps, day and night |
| M5 | **Modes & polish** | 11 | Air Superiority, Team Objective, Free Flight extras; cockpit camera; graphics upgrades; full audio; gamepad; settings; Dockerfile; README | All four modes playable online; `docker build`/`run` serves the game |

## 21. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Flight-model tuning takes many iterations | Numeric performance targets in data + tests; `?debug=1` overlay |
| Balance across 8 aircraft | Automated seeded tournament; tuning only in data files |
| Prediction jitter | Queue-depth feedback, smoothing, lag simulator |
| Terrain and cloud rendering cost | Quadtree LOD, fog, worker builds, quality settings |
| Browser floating-point differences | Server authoritative; reconciliation corrects drift |
| Scope creep | Milestones each runnable; out-of-scope list (§23) |
| Node native TypeScript limits | Erasable syntax only, enforced by `tsconfig` |

## 22. Content, attribution and licensing

- **Fictional content:** aircraft, weapons, the country, cities, villages and airfields are fictional.
  - Aircraft are only "inspired by" real types; no real designations or real specifications are shown.
  - No real-world military installations are reproduced.
- **Abstraction:** weapons and sensors are gameplay abstractions (§10). No real-world construction or operational
  guidance.
- **Tone:** a neutral game scenario, with no real events, casualties or political messaging.
- **Licensing:** `three` and `ws` are MIT licensed. No project license file is added; the owner decides.

## 23. Out of scope (v1)

- Accounts, persistence, stats history.
- Text/voice chat.
- Landing and rearming, fuel, spins/departures, wind.
- Air-to-ground weapons.
- Real-world map data.
- Functional cockpit instruments/MFDs.
- VR, mobile/touch.
- Anti-cheat beyond server authority and input validation.
- Automated browser (Playwright) test suite.
- Public deployment itself (a Dockerfile is provided; deploying needs the owner's host account).
