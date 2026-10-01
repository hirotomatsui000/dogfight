# M1c "Website basics" Implementation Plan

**Goal (spec §20, §24):** a first-time visitor completes a guided training flight and a fight on a mid-range laptop
without reading the README.

**Scope:** guided training flight; settings screen (volume, mouse sensitivity, invert, HUD color and size, key
remapping); gamepad and flight-stick support with axis calibration; Low/Medium/High graphics presets chosen from the
frame rate; loading progress; page metadata, social-preview image and icon; color-blind-safe team markers; every
sound warning also shown as text.

## Global constraints

- Same conventions as M1a/M1b/M1d: TypeScript strict, erasable syntax only, `.ts` import extensions, tests colocated.
- Pure logic (settings validation, key bindings, gamepad mapping, quality governor, load progress, training rules) is
  test-first. DOM, WebGL and feel are verified in the browser.
- Settings persist in `localStorage` through `ui/storage.ts` (try/catch, defaults when unavailable).
- No new runtime dependencies.

## Design decisions

| Topic | Decision |
|---|---|
| Settings model | One `Settings` object (`ui/settings.ts`) with defaults and a `sanitizeSettings` that repairs any stored value. Existing keys (`sound`, `reduceMotion`, `controlMode`) move into it, read once from their old keys. |
| Volume | Master volume 0–100%; the old sound on/off stays as a mute toggle. |
| Mouse | Sensitivity multiplier 0.25–3× of today's 0.0022 rad/px; invert Y flips mouse pitch only. |
| HUD | Color: green (default), amber or white; the team colors and red warnings stay. Size: 80–140%, applied as one canvas transform so the layout scales together. |
| Key remapping | Every keyboard action has a binding (`input/bindings.ts`). Rebinding a key that another action uses swaps them, so no action is ever left without a key. Esc stays pause and cannot be bound; Ctrl/Meta chords are never used. The Controls list shows the current keys. |
| Gamepad | Standard mapping in the table below. Any other device (flight sticks) uses a configurable profile: roll, pitch, rudder and throttle axes with invert flags, and buttons for gun, missile, flares, next target, bomb, airbrake. Calibration records each axis's rest value and travel; a 0.08 dead zone applies after it. Stick input overrides the mouse aim like the keyboard does. |
| Graphics | Low: pixel ratio 0.75, no antialias, half particles. Medium: pixel ratio 1, antialias. High: pixel ratio up to 2, antialias, full particles. "Auto" starts at High (Medium on screens over 2.5 M pixels) and steps down one level after 3 s below 45 fps in a match; it never steps back up within a session, and the result is remembered. |
| Loading | A progress line on the title screen counts the 6 scenery photos and the jet models; the match's loading panel shows the same count. |
| Metadata | Open Graph and Twitter tags, a 1200×630 preview image rendered from the title scene (`public/og-image.jpg`), the existing SVG icon plus a 180 px PNG for iOS. The image URL is relative unless `SITE_URL` is set at build time. |
| Color-blind safety | Friend and foe differ in shape everywhere: HUD markers (triangle / diamond, already), radar scope (triangle / square), edge arrows (foes only), scoreboard and score line (team names, not color alone). |
| Sound warnings as text | Missile warning → `MISSILE` (exists); seeker growl → `SRM TRK`, lock tone → `SRM LOCK` (exist); hit taken → a `HIT` flash; low altitude has no sound. A test lists every warning tone with its text. |
| Training | A sixth mode, `training`, run by `TrainingMode` with five steps (below). Drones are aircraft flown by a `DronePilot` that holds a gentle orbit and never fires; the scripted missile in step 4 is launched by the mode. A mode gets these powers through an optional `direct(director)` hook that the World calls each tick. |

### Gamepad standard mapping

| Control | Action |
|---|---|
| Left stick | Pitch (push = nose down) and roll |
| Right stick | Look around |
| LB / RB | Rudder left / right |
| LT / RT | Throttle down / up (analog rate) |
| A | Missile |
| X | Cannon (hold) |
| B | Flares |
| Y | Next target |
| D-pad down | Bomb |
| D-pad up | Airbrake (hold) |
| Start | Pause |
| Back / View | Scores (hold) |

### Training steps

1. **Fly**: three rings 4 km apart ahead of the spawn. "Point the mouse at the ring — the jet follows." Done when the jet
   passes within 250 m of each ring in turn.
2. **Gun**: a drone 1.5 km ahead, 300 m above. "Close in. Inside 2 km a gun circle appears: put the nose on it and
   hold SPACE." Done when the drone is destroyed.
3. **Missile**: a drone 4 km ahead. "Keep it in front until the tone is steady (SRM LOCK), then press F." Done when
   the drone is destroyed.
4. **Defend**: a drone behind fires one missile at the player. "MISSILE! Press X for flares, then turn hard when
   TURN HARD NOW flashes." Done when the missile is gone and the player is alive. If the player is shot down the
   step restarts after the respawn.
5. **Done**: the mode reports a winner; the end screen says "Training complete" and offers a dogfight.

Each step refills the player's stores. The player cannot lose the mode; dying restarts the current step.

## Tasks

1. **Settings store** — `ui/settings.ts`: `Settings`, `DEFAULT_SETTINGS`, `sanitizeSettings`, `loadSettings`,
   `saveSettings`, migration of the old keys. Tests.
2. **Key bindings** — `input/bindings.ts`: actions, defaults, `rebind` with swap, `keyLabel`, help rows; the
   `ControlMapper` and `DomInput` read bindings; `controls-help.ts` builds rows from them. Tests.
3. **Gamepad** — `input/gamepad.ts`: pure `readGamepad(state, profile, calibration)` → stick, throttle rate, look,
   buttons; standard and custom profiles; calibration math; `GamepadPoller` (DOM) reading `navigator.getGamepads()`.
   `ControlMapper.map` takes an optional gamepad frame. Tests.
4. **HUD options and accessibility** — mutable HUD primary color and scale; radar scope shapes; `HIT` flash;
   warning-to-text table test.
5. **Graphics presets** — `render/quality.ts`: presets, `QualityGovernor` (pure), renderer and effects knobs. Tests.
6. **Loading progress** — `render/load-progress.ts` (pure counter) used by asset loaders, the title screen and the
   match loading panel. Tests.
7. **Settings screen** — `ui/settings-screen.ts`: a dialog with Sound, Controls (steering, sensitivity, invert, key
   list with rebinding), Gamepad (status, live axes, calibrate, assignments), Display (HUD color, HUD size,
   graphics, reduce motion). Opened from the title screen and the pause menu; changes apply live.
8. **Training rules** — `shared/modes/training.ts`, `shared/ai/drone-pilot.ts`, the `direct` hook and
   `ModeDirector` in the World (add a drone, remove an aircraft, launch a scripted missile, restock). Tests with a
   headless World.
9. **Training client** — title-screen TRAINING link (highlighted on a first visit), HUD prompt panel, ring markers
   (3D rings and HUD markers), end screen "Training complete" with a FLY DOGFIGHT button.
10. **Page metadata** — `index.html` tags, `public/og-image.jpg`, `public/icon-180.png`, build-single copies `public/`
    files next to the page.
11. **Verification** — browser run of training, settings, a gamepad mapping check with a fake gamepad, a match on each
    graphics preset, the single-file build; README, spec and handoff updated.
