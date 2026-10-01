# M2 "Multiplayer" Implementation Plan

**Goal (spec §7, §16, §20):** two browser tabs plus a second LAN machine fight each other smoothly at `?lag=150`;
integration tests are green; `docker build` / `docker run` serves the game.

## Global constraints

- Same conventions as before (TypeScript strict, erasable syntax, `.ts` imports, colocated tests). The server runs
  directly with Node's type stripping: `node src/server/main.ts`.
- The server owns hits, damage, locks, guidance, ammunition, scoring and respawns. Clients send only inputs.
- One new runtime dependency: `ws` (MIT) on the server.

## Architecture

```
browser                                   server (Node, one port, default 8080)
  NetworkSession ── WebSocket /ws ──────▶ connection ─▶ RoomManager ─▶ Room (World at 60 Hz)
   predicts own jet, interpolates others    validation, rate limits       bots fill teams, snapshots 30 Hz
  GameSession interface (unchanged HUD,   HTTP: dist/ (prod) or Vite middleware (dev), /healthz, /api/rooms,
  renderer and input code)                /api/error
```

## Protocol (shared/net)

Version `PROTOCOL_VERSION` (an integer) must match; the page also compares the server's build version.

### JSON messages (text frames, ≤ 2 KB from clients)

| Direction | Message | Fields |
|---|---|---|
| C→S | `hello` | `version`, `room`, `callsign`, `aircraftId`, `mode` (used only when the room is new) |
| S→C | `welcome` | `version`, `build`, `room`, `you` (aircraft id), `modeId`, `mapSeed`, `tick`, `tickRate`, `snapshotRate` |
| S→C | `reject` | `reason` |
| C→S | `ping` | `t` (client ms) |
| S→C | `pong` | `t`, `tick` |
| S→C | `roster` | `players`: id, callsign, team, aircraftId, isBot, kills, deaths |
| S→C | `events` | `tick`, `events` (GameEvent[]) |
| S→C | `status` | `status` (ModeStatus) and `tick` |
| C→S / S→C | `chat` | `index` (preset) / `from`, `index` |
| S→C | `matchEnd` | `status`, `restartInS` |
| S→C | `shutdown` | — |

### Binary input (C→S, 17 bytes, little-endian)

| Offset | Type | Field |
|---|---|---|
| 0 | u8 | kind = 1 |
| 1 | u32 | seq (client tick) |
| 5 | i8 ×3 | pitch, roll, yaw × 127 |
| 8 | u8 | throttle × 255 |
| 9 | u16 | buttons: airbrake, cannon, missile, flares, bomb, nextTarget, weapon=mrm, helmetSight |
| 11 | i16 ×2 | lookYaw × 32767/π, lookPitch × 32767/(π/2) |
| 15 | u16 | viewDelay (ticks) |

Presses (missile, flares, bomb, next target) ride on one input; the server consumes every input exactly once.

### Binary snapshot (S→C, every 2nd tick)

Header: u8 kind = 2, u32 tick, u32 ackSeq, u8 queueDepth.

Aircraft (u8 count), each: u16 id, u8 flags (alive, firing cannon), u8 spawnGen (mod 256), u16 hp, u8 throttle × 255,
f32 ×3 position, i16 ×4 quaternion × 32767, i16 ×3 velocity × 10 (m/s).

Missiles (u8 count), each: u16 id, u16 owner, u16 target (0xffff none), u8 flags (motor burning, team russia), f32 ×3
position, i16 ×3 velocity × 10.

Bombs (u8 count), each: u16 id, u8 team, f32 ×3 position, i16 ×3 velocity × 10.

Ground targets (u8 count), each: u8 hp (0–255 = 0–maxHp), u8 destroyed.

Own section (the receiving player's jet, full precision): f32 ×3 pos, vel, angVel; f32 ×4 quaternion; f32 throttle,
airbrake; u16 cannon rounds; u8 srm, mrm, countermeasures, bombs; u8 seeker mode, u16 seeker target (0xffff), f32 ×3
seeker axis; u16 designated target (0xffff); u16 out-of-bounds ticks; u8 contact count, each u16 id, u8 flags
(visual, radar), f32 range, f32 off-nose angle.

About 34 bytes per jet: 32 jets at 30 Hz ≈ 33 KB/s, under the 50 KB/s budget.

## Client prediction and interpolation

- Fixed 60 Hz client ticks; each tick quantizes the input through the codec, sends it, keeps it, and steps the own
  jet with `stepFlight` (damage-scaled like the server).
- On a snapshot: reset the own jet to the full-precision state, replay inputs after `ackSeq`, and fold the jump into a
  visual offset that decays with τ = 0.1 s (a respawn resets hard).
- Others render 100 ms behind the estimated server time, Hermite position (with velocities) and slerp orientation;
  extrapolation stops after 200 ms.
- Clock: ping every 2 s; the lowest-RTT sample of the last 10 gives the offset.
- Queue: the server reports its input-queue depth; the client speeds up or slows its tick rate by up to 2% to keep it
  about 2.
- Tracers are cosmetic: the client fires them for every jet whose "firing" flag is set.
- `?lag=<ms>&jitter=<ms>` delays both directions; `?debug=1` shows FPS, RTT, queue depth and prediction error.

## Server

- Config from env/CLI: `PORT` 8080, `HOST` 0.0.0.0, `MAX_ROOMS` 20, `MAX_HUMANS_PER_ROOM` 16, `BOTS_PER_TEAM` 4,
  `BOT_SKILL` veteran.
- Room: the first join creates it with the requested mode (Dogfight or Strike). Each human flies the jet they chose
  (that sets their team); bots fill each team to `BOTS_PER_TEAM`. Inputs queue per player; one is consumed per tick
  and the last is repeated (without its presses) when the queue is empty. When the mode has a winner the room sends
  `matchEnd`, waits 10 s and starts a new match with the same pilots. A room closes 30 s after its last human leaves.
- Strike online gives each team 4 aircraft per human (spec §13.1).
- Lag compensation: cannon hit tests rewind targets by the shooter's `viewDelay` (≤ 15 ticks, same life only).
- Validation: inputs clamped; binary messages ≤ 64 B, JSON ≤ 2 KB, ≤ 120 inputs/s, chat ≤ 1/s; 3 violations within
  10 s disconnect the client. A room step that throws is logged; 3 in a row close the room.
- Shutdown: SIGINT/SIGTERM send `shutdown` and close.

## Tasks

1. **Protocol and codecs** — `shared/net/protocol.ts`, `shared/net/codec.ts`, `ProtocolError`; round trips,
   quantization bounds and garbage input. Tests.
2. **Lag compensation** — `MotionHistory.positionAt`, projectile `rewindTicks`, swept hit tests against the rewound
   target. Tests.
3. **Room** — `server/room.ts`: join/leave, bots, queues, stepping, snapshots, events, roster, status, chat, match
   restart; a transport-free `Peer` interface. Tests.
4. **Rooms and connections** — `server/room-manager.ts`, `server/connection.ts` (hello, validation, rate limits,
   violations). Tests.
5. **Server process** — `server/main.ts`, `server/config.ts`, `server/http.ts` (static files, Vite middleware in dev,
   health, rooms list, error reports), LAN URLs, shutdown. Integration test with real WebSockets.
6. **NetworkSession** — `client/session/network-session.ts`, `net-transport.ts` (WebSocket and lag simulator),
   clock sync, prediction, interpolation, cosmetic tracers. Tests with an in-memory transport against a real Room,
   including convergence at 150 ms.
7. **Online UI** — title-screen Online panel (room name, mode, Quick play, invite link), connection-lost overlay with
   reconnects, quick chat (keys 7–0), version banner, error reporting, debug overlay.
8. **Game integration** — `startGame` takes either session; online match end shows results and the room restarts.
9. **Deploy** — `npm run serve` (dev, Vite middleware) and `npm start` (production), Dockerfile, `.dockerignore`,
   `tools/smoke-test.ts`, README.
10. **Verification** — two headless tabs fighting through the local server at `?lag=150`, integration tests, Docker
    build if Docker is available, docs and handoff.
