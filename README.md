# Contested Skies

A browser-based flight-combat prototype. Two teams, **USA** and **Russia**, fly **fictional** fighters inspired by
real aircraft over a fictional landscape inspired by Poland. This repository is being built in milestones (see
`docs/superpowers/specs/2026-09-29-poland-dogfight-design.md`).

**Current milestone: M1b "Fight"**
- Two aircraft: the Kestrel (USA) and the Kobchik (Russia).
- Dogfight an AI pilot (Rookie, Veteran or Ace) in Team Deathmatch: first to 15 kills, or the most after 10 minutes.
- Weapons: a cannon with a lead marker, heat-seeking missiles that need a lock, and flares.
- Damage, kill credit and respawns; tracers, missile trails, flares, explosions and smoke; synthesized sound.
- A combat HUD with target box, missile lock, missile warning, radar display, kill feed and scoreboard.
- A third-person camera that follows your jet, and a title screen over a live 3D view of the jet you pick.
- Sim-lite flight physics over a 60 × 60 km test range with photo scenery; Free Flight is still available.
- Everything runs locally in the browser.

## Requirements

- Node.js **23.6 or newer** (developed with Node 26).
- A current desktop browser with WebGL (Chrome, Edge, Firefox or Safari).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, pick an aircraft and an opponent, and press **FLY** (or **Free flight** to fly without
enemies). **Controls** on the title screen lists the keys and switches between mouse aim and keyboard steering.
Click the view to capture the mouse, then fly with the mouse.

Other devices on the same network can open the "Network" URL that Vite prints.

## Controls

| Action | Keys |
|---|---|
| Aim (mouse-aim mode) | Mouse (click the view to capture it) |
| Pitch / roll / rudder | W/S (W = nose down) · A/D · Q/E |
| Throttle (top 10% = afterburner) | Shift up · Z down · mouse wheel |
| Airbrake | B (hold) |
| Cannon | Space or left mouse (hold) |
| Missile (needs the lock tone) | F |
| Flares | X |
| Next target | R |
| Look around (swings the camera round your jet) | C or right mouse (hold) |
| Scoreboard | Tab (hold) |
| Pause / settings | P or Esc |

In a fight:
- The nearest enemy ahead is targeted automatically; R picks the next one.
- The missile seeker growls while it tracks and gives a steady tone when locked. Then press F.
- Inside 2 km a gun aim circle appears. Put the nose on it and fire.
- When the HUD shows MISSILE, turn hard and press X for flares. Flares work better off afterburner.

The camera always follows from behind and above your jet (third person).

## Test and build

```bash
npm test
npm run build
```

`npm test` runs the Vitest suite. It checks the flight model against each aircraft's data-file performance targets:
top speed, turn rate, stall speed and G-limits.

`npm run build` type-checks with TypeScript and builds the production bundle into `dist/`.

## Publish as a website

```bash
npm run build:single
```

This writes `dist-single/index.html`: the whole game, including the scenery photos, in one self-contained file
(about 5 MB, no other assets).

To publish it on Netlify:
1. Open https://app.netlify.com/drop.
2. Drag the `dist-single` folder onto the page.
3. Netlify gives the site a public URL, which you can rename under **Site configuration**.

Any static host works the same way, and the file also runs when opened directly in a browser. Visitors need a
desktop or laptop with a keyboard and mouse; phones and tablets see a notice.

## Scenery photos

The sky is a real photo (Poly Haven, CC0). The ground uses real Sentinel-2 satellite imagery of Polish farmland,
forest and the Tatra mountains (EOX, CC BY 4.0), tiled across the fictional map by land type. See `CREDITS.md`.
`node tools/fetch-assets.ts` re-creates `src/client/assets/` from the original sources (macOS, needs `sips`).

## Project layout

| Path | Contents |
|---|---|
| `src/shared/` | Pure TypeScript game core, reused by the future multiplayer server. It holds data-driven aircraft (`data/aircraft/`), physics (`physics/`), steering AI (`ai/`), terrain and maps (`map/`, `data/maps/`), game modes (`modes/`) and the simulation `world/`. |
| `src/client/` | Browser client: session loop, input, rendering (Three.js), cameras, HUD and menus. |
| `docs/superpowers/` | Design spec and implementation plans. |

### Adding an aircraft

1. Copy `src/shared/data/aircraft/kestrel.ts`, change the numbers, and register the new file in `registry.ts`.
2. Run `npm test`. The flight-model tests check the new aircraft against its own `performance` targets.

The 3-D model is generated from the `visual` block, so no rendering code changes are needed.

## Content note

All aircraft, weapons, places and organizations are fictional. Aircraft are only *inspired by* real types and use
invented names and specifications.
