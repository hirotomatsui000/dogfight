# Handoff: spec revision 5 is finished (branch `feature/m1b-fight`)

Talk to the owner in Japanese; commit messages end with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Done (committed)

- `fc84545` spec revision 5; `b862081` smoother handling; `ebe0850` missiles a well-timed break can beat.
- `080f89a` enemy jets and missiles visible at any range; red missile markers, edge arrows, TURN HARD NOW.
- `4908e63` fix: iPhone Safari before iOS 26 has no `requestPointerLock`; pressing FLY threw and showed
  "Something went wrong" to other people opening the Netlify site on phones.
- Verified: 319 tests, `tsc` clean, browser at 1280×720 (missile warning, TURN HARD NOW, 60 fps, no console
  errors), and the no-pointer-lock case starts a match. `dist-single/index.html` rebuilt (4965 kB).

## Open decisions for the owner

1. Redeploy `dist-single` on Netlify (drag the folder onto the existing site's Deploys page to keep the URL).
2. Phones still cannot fly (no keyboard or mouse). Options: block FLY on touch-only devices with a clear message,
   or build touch controls later.
3. Finishing the branch: merge into `develop`, open a PR (there is no git remote) or keep.
