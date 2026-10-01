# M3 "Roster & weapons" Implementation Plan

**Goal (spec §9, §10, §20):** all 8 aircraft are selectable, the MRM "Lance" with chaff and the RWR `LOCK` warning work
offline and online, and a seeded ace-vs-ace tournament keeps every pairing's win rate within 35–65%.

## Owner decisions (2026-10-01)

- The owner's imported models move to the jets they depict: the F-35A model to the **Shade**, the Su-57 model to the
  **Prizrak**. The Kestrel and the Kobchik get the upgraded parametric models.

## Global constraints

- Same conventions as before (TypeScript strict, erasable syntax, `.ts` imports, colocated tests).
- Balance is tuned only in data files (`src/shared/data/aircraft/*.ts`, `src/shared/data/weapons.ts`), never in the
  flight or combat code.
- The wire protocol changes, so `PROTOCOL_VERSION` goes to 2; a page and a server of different versions refuse
  each other with the "game updated" notice.

## Roster

Order in the registry (and on the title screen): USA Shade, Tempest, Kestrel, Condor; Russia Prizrak, Yastreb, Sapsan,
Kobchik. The numbers start from spec §9.3; performance targets per jet live in its data file and are checked by the
flight-model suite, which already runs for every registered aircraft. Sensor traits: Shade has sensor fusion, Sapsan
two seats, Kobchik a helmet sight.

New visual fields for the parametric generator (all optional with defaults, so data stays short):
`engineSpacingM` (twin engines), `intakes` (`chin`, `side`, `caret`), `lerx` (leading-edge root extensions),
`wingShape` (`swept`, `delta`, `diamond`) and `tailSweepDeg`. Two seats come from `sensors.twoSeat`.

## Weapons and sensors

- `MissileSpec` gains `guidance: 'ir' | 'radar'`, `activeRangeM` (radar: independent inside this range, scaled by
  `1 − 0.5·stealth` of the target) and `stealthyCountermeasureFactor`. `MRM_LANCE` per spec §10.2: motor 110 m/s² for
  8 s, 60 s flight, N = 3, 20 g, 0.5 s lag, same blast, 2 s between launches, chaff 30% (×1.3 against targets with
  stealth ≥ 0.5).
- **Radar lock** (`targeting/radar-lock.ts`): builds only while the MRM is selected and the jet has one. The designated
  target must be an own-radar contact inside the cone; lock time 1.5 s × 0.7 (two seats) × 0.8 (sensor fusion);
  kept while the target stays a radar contact. States `off`, `tracking`, `locked`.
- **Launch:** F with the MRM selected fires on a radar lock. Mid-course the launcher supports the missile: the target
  must stay a radar contact of the launcher (inside its cone) until the missile is within its active range;
  otherwise the missile loses the target. Once active it guides on its own like the Dart (gimbal limit, terrain).
- **Countermeasures:** one salvo is a flare plus a chaff cloud. Each missile guiding on the jet rolls once per salvo
  against its own countermeasure (Dart: flares, Lance: chaff). Chaff lasts 4 s (visual only).
- **RWR:** `lockedByRadar` on every aircraft each tick when an enemy radar lock or a supported Lance is on it. The HUD
  shows `LOCK`, a caption and a warble; the `MISSILE` warning works for both missiles.

## Network (protocol 2)

- Missiles: flags gain bit 2 = Lance.
- Own section: u8 radar-lock state, u16 radar-lock target (0xffff none), u8 lock progress (0–255), u8 RWR flags
  (bit 0 = locked by radar).
- Events: `missileLaunched` gains `kind`.

## Client

- Keys 1 / 2 select SRM / MRM (already bindable); gamepad D-pad left/right. The HUD weapon line shows both missiles
  with the selected one boxed, the radar lock (closing diamond, `LOCK`), and the RWR `LOCK` warning with a caption.
- Lance: larger missile, whiter and longer trail; chaff: a short-lived glittering cloud.
- **Upgraded generator:** fuselage lofted from cross-sections (nose, canopy hump, intakes, engine bulges, tail),
  wings and tails with a thin airfoil (sharp edges, thicker root), glass canopy (one or two seats) with a frame,
  painted textures generated per jet: team scheme (USA two-tone greys; Russia blue-grey splinter camouflage), panel
  lines, a fin flash in the team color and a two-digit side number, plus a roughness pattern. The scene's sky
  environment map lights and reflects the paint. Textures are skipped where there is no DOM (tests).
- Title screen: the aircraft picker shows two team rows of four; the showcase previews each jet.
- AI opponents fly a random jet of their team (seeded per match) offline and online.

## Tasks

1. **Plan** — this file.
2. **Weapons data and radar lock** — `MissileSpec` generalization, `MRM_LANCE`, chaff, `radar-lock.ts`. Tests.
3. **Combat** — weapon selection, radar lock in the combat step, Lance launch and mid-course support, chaff rolls,
   RWR flag, events. Tests.
4. **Roster** — six data files, registry order, visual fields, validation, performance tuning to the targets. Tests.
5. **Bots** — MRM tactics (select, lock, fire within range, crank to keep support), chaff, random jets per team. Tests.
6. **Network** — codec and protocol 2, NetworkSession and Room. Tests.
7. **Client weapons** — weapon select, HUD (weapons line, radar lock, RWR), sounds and captions, Lance and chaff
   effects. Tests for the pure parts.
8. **Model generator** — lofted fuselage, airfoil wings, canopy glass, painted textures, visuals for the 8 jets,
   imported models moved to Shade and Prizrak. Tests (geometry sanity, no NaN, bounding box near the data size).
9. **Title screen** — 8-jet picker, summaries, showcase.
10. **Tournament** — `shared/ai/tournament.ts`, `tools/tournament.ts` (`npm run tournament`), an opt-in test
    (`TOURNAMENT=1`), data tuning until every pairing is within 35–65%.
11. **Verification and docs** — browser checks (title with each jet, a fight with Lance and chaff, online), spec
    revision 10, README, handoff, push.
