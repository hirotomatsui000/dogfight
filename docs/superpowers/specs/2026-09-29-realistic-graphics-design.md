# Realistic Graphics (Photo Sky + Satellite Land-Class Ground) — Design

- **Date:** 2026-09-29
- **Status:** Approved in chat (approach 1, full quality, downloads approved). Since M4 (main spec revision 11) the
  sky photo is retired: a computed sky follows the time of day and the weather; the satellite-photo ground stays.
- **Parent spec:** `2026-09-29-poland-dogfight-design.md` (§15.4 Graphics)

## Goal

Make the prototype look realistic by using real photographs from free-license sources, while keeping the map
fictional and the site deployable as a single HTML file.

## Approach

**Land-class texturing.** Real satellite photos of farmland, forest and mountains are tiled across the procedural
terrain according to each vertex's land cover, as classic flight simulators did. The map stays fictional; the photos
only provide surface texture.

Alternatives rejected:
- Draping one real area: needs real geography, which the brief ruled out.
- Procedural-only shaders: less realistic, and not what was asked.

## Assets

All assets are committed, processed, under `src/client/assets/`. `tools/fetch-assets.ts` records exactly how they
were obtained. Attribution lives in `CREDITS.md` and in the start menu.

| File | Source | License | Use |
|---|---|---|---|
| `sky.jpg` (4096×2048) | Poly Haven "Kloofendal 48d Partly Cloudy (Pure Sky)" (Greg Zaal, Jarod Guest), tonemapped JPG | CC0 | Background, image-based lighting, sun direction, haze color |
| `sat-farmland.jpg` (2048²) | EOX Sentinel-2 cloudless 2017 WMS, strip fields near Hrubieszów (Lublin Upland) | CC BY 4.0 | Fields and meadow land cover |
| `sat-forest.jpg` (2048²) | EOX Sentinel-2 cloudless 2017 WMS, Puszcza Notecka pine forest | CC BY 4.0 | Forest land cover |
| `sat-mountain.jpg` (2048²) | EOX Sentinel-2 cloudless 2017 WMS, High Tatras | CC BY 4.0 | Rock land cover and steep slopes |
| `detail-grass-rock.jpg` (1024²) | Poly Haven "Aerial Grass Rock" diffuse | CC0 | Close-up detail at low altitude |
| `waternormals.jpg` | three.js repository r186 (`examples/textures`) | MIT | Water wave normals |
| `sky-meta.json` | Derived from `sky.jpg` by `tools/fetch-assets.ts` | — | Sun direction and horizon (haze) color |

Required attribution:
> Sentinel-2 cloudless 2017 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2017), CC BY 4.0.

## Rendering changes

- **Sky** (`sky.ts`):
  - Equirectangular background from `sky.jpg`; image-based lighting from `PMREMGenerator.fromEquirectangular`.
  - The directional sun light is placed where the photo's sun is, and the haze (fog) color is the photo's horizon color.
  - Replaces the analytic `Sky` shader.
- **Terrain** (`terrain-mesh.ts` + `terrain-material.ts`):
  - `MeshStandardMaterial` extended with `onBeforeCompile`, so lighting, image-based lighting and fog stay standard.
  - Per-vertex land-class weights: farmland, forest, mountain, sand, plus water and snow.
  - Each satellite texture is sampled twice (a 16 km tile and a rotated 11 km tile) and mixed by low-frequency noise,
    with mirrored repeat, so tiling isn't obvious.
  - A close-up detail photo fades in within about 2 km of the camera.
  - Water cover gets a water color and low roughness, so it reflects the sky.
- **Sea:** `MeshStandardMaterial` with the animated `waternormals.jpg` normal map, low roughness, and sky reflections
  from the environment.
- **Aircraft:** existing physically based materials, now reflecting the sky via `scene.environment`. Materials are
  lightly retuned. Geometry is unchanged.
- **Loading:** textures load before the flight starts, with a "Loading scenery…" overlay.

## Build

- `npm run build:single` builds with `--mode single`, where Vite inlines every imported asset as a data URI. The
  existing inliner then produces one HTML file of about 10–12 MB.
- A guard fails the build if any `/assets/` reference survives.
- `npm run build` still produces a normal multi-file build.

## Testing

- **Unit tests (TDD):**
  - BMP decoding and brightest-pixel search (sun detection).
  - Equirectangular pixel → direction, matching three.js's equirectangular UV mapping.
  - Square ground bounding boxes for the WMS export.
  - Land cover → land-class weights.
  - The external-asset guard.
- **Visual verification in the browser:**
  - Cockpit view at 3 km, a low pass under 300 m, chase view, over the sea.
  - Frame rate stays at or near 60 fps.
  - No console errors.

## Out of scope

Realistic 3-D aircraft models, volumetric clouds, weather and night lighting. These stay in M4/M5.
