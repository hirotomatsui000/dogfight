# Realistic Graphics Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Photo sky, satellite land-class ground, realistic water and sky-lit aircraft, still shipped as one HTML file.

**Spec:** `docs/superpowers/specs/2026-09-29-realistic-graphics-design.md`

## Global Constraints

- Only the approved assets from the spec's asset table. Licenses: CC0, CC BY 4.0 (with attribution), MIT.
- No new npm dependencies. Image processing uses macOS `sips` in `tools/fetch-assets.ts` only; the committed assets
  make builds independent of it.
- `src/shared/**` is untouched (rendering only).
- TDD for every pure function. Shader output is verified visually in the browser pane.
- `npm test` and `npm run build:single` pass before each commit.

## Tasks

### Task 1: Asset pipeline and credits

- **Files:** `tools/lib/bmp.ts`, `tools/lib/geo-bbox.ts`, `tools/lib/sky-analysis.ts` (each with a `*.test.ts`),
  `tools/fetch-assets.ts`, `src/client/assets/*`, `CREDITS.md`, `.gitignore` (`.asset-cache/`).
- **Tests first:**
  - `decodeBmp24` handles bottom-up rows and 4-byte row padding.
  - `squareBBox(lat, lon, halfSizeKm)` has equal ground width and height (±1%).
  - `equirectPixelToDirection` matches three.js equirectangular UVs: u = 0.5 → +x, u = 0.75 → +z, top row → +y.
  - `findSun` picks the brightest blurred region and returns its direction.
  - `horizonColor` averages the band just above the horizon, excluding the sun.
- **Script:** downloads to `.asset-cache/`, uses `sips` to resize and recompress into `src/client/assets/`, and writes
  `sky-meta.json` (`{ sunDirection: [x, y, z], horizonColor: '#rrggbb' }`).
- **Accept:** the assets exist at the planned sizes. Inspect each satellite image; re-crop if a large town or lake
  dominates it.

### Task 2: Texture loading and loading overlay

- **Files:** `src/client/render/assets.ts`, `src/client/game.ts` (await assets, show "Loading scenery…").
- **Details:**
  - `loadSceneryTextures(renderer)` returns sky, satellites, detail and water normals with the correct color spaces
    (sRGB for color, none for normals), `MirroredRepeatWrapping` on tiled maps, and anisotropy set to the maximum.
- **Accept:** the game starts after the textures load; load errors show a message.

### Task 3: Photo sky, image-based lighting, sun and haze

- **Files:** `src/client/render/sky.ts` (rewrite).
- **Details:**
  - Background: the equirectangular texture.
  - Environment: a PMREM of the same texture.
  - `DirectionalLight` along `sunDirection`.
  - `Fog(horizonColor)`.
  - `backgroundIntensity` and `environmentIntensity` tuned visually.
- **Accept:** the sky looks like the photo, the sun direction matches the lighting, and the haze blends into the
  horizon.

### Task 4: Satellite land-class terrain material

- **Files:** `src/client/render/land-class.ts` (+ test), `src/client/render/terrain-material.ts`,
  `src/client/render/terrain-mesh.ts`.
- **Tests first:** `landClassWeights(cover, height)` → `{ farm, forest, mountain, sand, water, snow }`, which sum to 1
  except for the snow overlay. Meadow counts as farm; rock counts as mountain; snow counts as mountain with the snow
  weight set.
- **Shader** (`onBeforeCompile` on `MeshStandardMaterial`):
  - Each land class takes two samples (16 km tile, and an 11 km tile rotated 37°) mixed by value noise.
  - Sand is a flat sand color. Snow blends toward white.
  - Water gets a water color and roughness 0.06.
  - A detail photo fades in within 2 km.
- **Accept:** from 3 km up the ground reads as real farmland, forest and mountains, with no visible seams and no
  obvious repetition.

### Task 5: Sea and aircraft materials

- **Files:** `src/client/render/terrain-mesh.ts` (sea material), `src/client/render/aircraft-model.ts` (material tuning),
  `src/client/game.ts` (animate water).
- **Accept:** the sea shows waves, sky reflections and sun glitter; aircraft reflect the sky.

### Task 6: Single-file build with inlined images, credits in the menu

- **Files:**
  - `vite.config.ts` (mode `single` raises `assetsInlineLimit`)
  - `package.json` (`build:single`)
  - `tools/inline-assets.ts` + test (`findExternalAssetRefs`)
  - `tools/build-single.ts` (guard)
  - `src/client/ui/menu.ts` (credits line)
  - `README.md`
- **Accept:** `dist-single/index.html` has no `/assets/` references; the credits are visible in the menu.

### Task 7: Browser verification and tuning

- **Checks:** menu → take off; screenshots in the cockpit view at 3 km, a low pass, the chase view and over the sea;
  frame rate at or near 60 fps; no console errors.
- Tune intensities, tile sizes and haze until it looks realistic. Commit.
