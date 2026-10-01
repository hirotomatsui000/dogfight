# Handoff: M1d "Strike" is built and verified (branch `claude/fighter-game-continuation-pvcht7`)

Talk to the owner in Japanese; commit messages end with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Repository

- GitHub: `hirotomatsui000/dogfight` (public). The owner pushed every local branch on 2026-10-01; the latest work
  was `feature/m1d-strike`. This branch continues from it.

## Done

- M1d Tasks 1–10 (`2ee569e` … `e7f1c3d`), the title-screen tweak that puts the Strike role under the jets and fits
  short screens (`c71924d`).
- `5374df9` fix: the Strike status line ran into the heading tape in windows narrower than about 1,250 px; it is now
  two lines.
- Task 11 verification (headless Chromium with software WebGL, so about 0.5 fps; frame rate not measurable here):
  - title screen at 1280×720 and 375×812: no page scroll, FLY, links and credits in view, the role line follows the
    jet in Strike;
  - Russia (Kobchik): status line, A/B/C markers with range and HP bars, impact circle and fall line, `BMB 8` → `7`
    after G;
  - USA (Kestrel), a full 8-minute match vs Rookie with a local-only patch that let the simulation run in real time
    (not committed): the bot destroyed B, time ran out, end screen `VICTORY · TARGETS HELD · DESTROYED: B (RADAR
    SITE)`; no console errors;
  - `npm run build:single` → `dist-single/index.html` (4983 kB), a Strike match starts from it.
  - 367 tests pass, `tsc` clean.

## Open decisions for the owner

1. Redeploy `dist-single` on Netlify (the copy the owner had did not include Strike yet).
2. Replace the generated jet models with the owner's own 3D models (requested 2026-10-01; files not received yet).
3. Next milestone: M1c "Website basics" (training flight, settings, gamepad, graphics presets) or M2 multiplayer.
