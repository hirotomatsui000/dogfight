# Contested Skies

A browser-based flight-combat prototype. Two teams, **USA** and **Russia**, fly **fictional** fighters inspired by
real aircraft over a fictional landscape inspired by Poland. This repository is being built in milestones (see
`docs/superpowers/specs/2026-09-29-poland-dogfight-design.md`).

**Current milestone: M1a "Fly"**
- One aircraft: the Kestrel light fighter.
- Sim-lite flight physics.
- A 60 × 60 km procedural test range.
- HUD, chase and free cameras; Free Flight mode.
- Everything runs locally in the browser.

## Requirements

- Node.js **23.6 or newer** (developed with Node 26).
- A current desktop browser with WebGL (Chrome, Edge, Firefox or Safari).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, choose an aircraft and press **Take off**.
Click the view to capture the mouse, then fly with the mouse.

Other devices on the same network can open the "Network" URL that Vite prints.

## Controls

| Action | Keys |
|---|---|
| Aim (mouse-aim mode) | Mouse (click the view to capture it) |
| Pitch / roll / rudder | W/S (W = nose down) · A/D · Q/E |
| Throttle (top 10% = afterburner) | Shift up · Z down · mouse wheel |
| Airbrake | B (hold) |
| Look around | C or right mouse (hold) |
| Camera: HUD → chase → free | V |
| Pause / settings | P or Esc |

The free camera is for testing: W/A/S/D move, Q/E go down/up, Shift is fast, and the mouse looks around.

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
