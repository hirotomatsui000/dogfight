# Contested Skies

A browser-based flight-combat prototype. Two teams, **USA** and **Russia**, fly **fictional** fighters inspired by
real aircraft over a fictional landscape inspired by Poland. This repository is being built in milestones (see
`docs/superpowers/specs/2026-09-29-poland-dogfight-design.md`).

**Current milestone: M1c "Website basics"** (after M1a "Fly", M1b "Fight" and M1d "Strike")
- A **training flight** (about 3 minutes): fly through rings, gun a drone, lock and fire a missile, beat a missile.
- **Settings**: volume, mouse sensitivity and invert, rebindable keys, gamepad and flight-stick setup, HUD color and
  size, graphics (Auto, Low, Medium, High) and camera shake.
- **Gamepads and flight sticks** through the browser's Gamepad API.
- Two aircraft: the Kestrel (USA) and the Kobchik (Russia), drawn with the owner's 3D models (inspired by the F-35A
  and the Su-57).
- Dogfight an AI pilot (Rookie, Veteran or Ace) in Team Deathmatch: first to 15 kills, or the most after 10 minutes.
- **Strike** mode: Russia bombs three fictional targets while the USA holds them for 8 minutes; 4 aircraft per team.
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

Open http://localhost:5173. New pilots start with **Training**. Otherwise pick a mission (Dogfight or Strike), an
aircraft and an opponent, and press **FLY** (or **Free flight** to fly without enemies). **Controls** lists the keys;
**Settings** changes them, the mouse, the gamepad, the HUD, the graphics and the sound (also from the pause menu).
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
| Bomb (Strike, Russian jets) | G |
| Flares | X |
| Next target | R |
| Look around (swings the camera round your jet) | C or right mouse (hold) |
| Scoreboard | Tab (hold) |
| Pause / settings | P or Esc |

Every key except Esc can be changed in **Settings → Keys**.

### Gamepad

A pad with the standard layout (Xbox, PlayStation and most others) works straight away:

| Control | Action |
|---|---|
| Left stick | Pitch and roll |
| Right stick | Look around |
| LB / RB | Rudder |
| LT / RT | Throttle down / up |
| X · A · B · Y | Cannon (hold) · missile · flares · next target |
| D-pad ↓ / ↑ | Bomb · airbrake (hold) |
| Start · Back | Pause · scores (hold) |

Flight sticks and other devices: open **Settings → Gamepad**, assign the roll, pitch, rudder and throttle axes and the
buttons (move or press each one), then **Calibrate**.

In a fight:
- The nearest enemy ahead is targeted automatically; R picks the next one.
- The missile seeker growls while it tracks and gives a steady tone when locked. Then press F.
- Inside 2 km a gun aim circle appears. Put the nose on it and fire.
- A missile fired at you shows as MISSILE with its range from the moment it launches, and a red marker (or an arrow
  at the screen edge) shows where it is. You can beat it without flares: when the HUD flashes TURN HARD NOW, about
  two seconds before impact, turn hard to put the missile on your wing. Breaking too early or too late does not
  work. Flares (X) help too, and work better off afterburner.
- Distant jets and missiles are drawn a little larger than life so they never shrink to a single pixel.

In Strike (choose **Strike** under Mission on the title screen):
- The Kestrel defends for the USA: keep at least two of the three targets standing for 8 minutes, or shoot Russia's
  jets down four times.
- The Kobchik attacks for Russia with 8 bombs: destroy two targets, or shoot the USA's jets down four times.
- Fly level about 1,500 m above a target. The circle on the ground shows where a bomb would land; press G as it
  crosses the target (RELEASE flashes). Three good hits destroy a target.
- Each side has 4 aircraft. Losing the fourth loses the match.

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

This writes `dist-single/index.html`: the whole game, including the scenery photos and the jet models, in one
self-contained file (about 6 MB), plus the social-preview image `og-image.jpg` and the icon `icon-180.png` that
other sites and phones fetch. For link previews on social sites, build with the site's address:
`SITE_URL=https://your-site.netlify.app npm run build:single`.

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

### Using your own 3D model for an aircraft

1. Put the original `.glb` file in `models-src/` (ignored by git) and add an entry for it to `MODELS` in
   `tools/prepare-models.ts`: the file name, and the turns that bring its nose to −z with the wings level.
2. Run `node tools/prepare-models.ts`. It writes `src/client/assets/models/<aircraft id>.glb` (1 long, simplified,
   1024 px WebP textures, meshopt-compressed).
3. Import the file in `src/client/render/aircraft-meshes.ts` and add the nozzle positions to `IMPORTED_MODELS`.
   The model is scaled to the aircraft's `visual.lengthM`.

## Content note

All aircraft, weapons, places and organizations are fictional. Aircraft are only *inspired by* real types and use
invented names and specifications.
