import type { AircraftConfig, Range } from './types.ts';

type Check = [ok: boolean, message: string];

const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
const isColor = (s: string) => /^#[0-9a-f]{6}$/i.test(s);
const validRange = (r: Range) => Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] < r[1];

/** Returns human-readable problems; an empty array means the config is valid. */
export function validateAircraftConfig(c: AircraftConfig): string[] {
  const p = c.physics;
  const s = c.sensors;
  const st = c.stores;
  const v = c.visual;
  const twr = p.thrustAbN / (p.massKg * 9.80665);
  // Support aircraft (M5) are big, slow radar planes: their own ranges for size, power, agility and toughness.
  const big = c.support === true;
  const checks: Check[] = [
    [/^[a-z][a-z0-9-]*$/.test(c.id), 'id must be lowercase kebab-case'],
    [c.name.trim().length > 0, 'name must not be empty'],
    [big ? inRange(p.massKg, 20000, 200000) : inRange(p.massKg, 5000, 40000), 'physics.massKg must be 5000..40000 (support 20000..200000)'],
    [big ? inRange(p.wingAreaM2, 50, 500) : inRange(p.wingAreaM2, 15, 100), 'physics.wingAreaM2 must be 15..100 (support 50..500)'],
    [p.thrustMilN > 0, 'physics.thrustMilN must be > 0'],
    [p.thrustAbN >= p.thrustMilN, 'physics.thrustAbN must be >= thrustMilN'],
    [big ? inRange(twr, 0.15, 0.6) : inRange(twr, 0.8, 1.4), `physics.thrustAbN gives thrust/weight ${twr.toFixed(2)}, must be 0.8..1.4 (support 0.15..0.6)`],
    [inRange(p.cd0, 0.012, 0.04), 'physics.cd0 must be 0.012..0.04'],
    [inRange(p.k, 0.05, 0.3), 'physics.k must be 0.05..0.3'],
    [inRange(p.clAlpha, 2, 6), 'physics.clAlpha must be 2..6'],
    [inRange(p.alphaMaxDeg, 10, 40), 'physics.alphaMaxDeg must be 10..40'],
    [p.aoaLimiterDeg >= p.alphaMaxDeg && p.aoaLimiterDeg <= 45, 'physics.aoaLimiterDeg must be alphaMaxDeg..45'],
    [big ? inRange(p.gMax, 2, 4) : inRange(p.gMax, 6, 10), 'physics.gMax must be 6..10 (support 2..4)'],
    [inRange(p.gMin, -4, -1), 'physics.gMin must be -4..-1'],
    [inRange(p.maxPitchRateDegS, big ? 3 : 10, 60), 'physics.maxPitchRateDegS must be 10..60 (support 3..60)'],
    [inRange(p.maxRollRateDegS, big ? 15 : 60, 400), 'physics.maxRollRateDegS must be 60..400 (support 15..400)'],
    [inRange(p.maxYawRateDegS, big ? 2 : 5, 60), 'physics.maxYawRateDegS must be 5..60 (support 2..60)'],
    [inRange(p.thrustVectoring, 0, 1), 'physics.thrustVectoring must be 0..1'],
    [inRange(p.fuelKg / p.massKg, 0.1, 0.45), 'physics.fuelKg must be 10..45% of massKg'],
    [inRange(p.departureResistance, 0, 1), 'physics.departureResistance must be 0..1'],
    [inRange(s.radarRangeKm, 10, big ? 250 : 120), 'sensors.radarRangeKm must be 10..120 (support 10..250)'],
    [inRange(s.radarConeDeg, 30, big ? 180 : 90), 'sensors.radarConeDeg must be 30..90 (support 30..180)'],
    [inRange(s.stealth, 0, 1), 'sensors.stealth must be 0..1'],
    [inRange(s.irSignature, 0.3, 2), 'sensors.irSignature must be 0.3..2'],
    [Number.isInteger(st.cannonRounds) && inRange(st.cannonRounds, 0, 2000), 'stores.cannonRounds must be an integer 0..2000'],
    [Number.isInteger(st.srm) && inRange(st.srm, 0, 8), 'stores.srm must be an integer 0..8'],
    [Number.isInteger(st.mrm) && inRange(st.mrm, 0, 8), 'stores.mrm must be an integer 0..8'],
    [Number.isInteger(st.countermeasures) && inRange(st.countermeasures, 0, 100), 'stores.countermeasures must be an integer 0..100'],
    [big ? inRange(c.damage.hitPoints, 100, 1000) : inRange(c.damage.hitPoints, 40, 200), 'damage.hitPoints must be 40..200 (support 100..1000)'],
    [inRange(c.damage.hitRadiusM, 3, big ? 30 : 12), 'damage.hitRadiusM must be 3..12 (support 3..30)'],
    [v.lengthM > 0 && v.spanM > 0 && v.fuselageRadiusM > 0, 'visual dimensions must be > 0'],
    [inRange(v.noseLengthFraction, 0.05, 0.5), 'visual.noseLengthFraction must be 0.05..0.5'],
    [inRange(v.wingPositionFraction, 0.1, 0.8), 'visual.wingPositionFraction must be 0.1..0.8'],
    [v.wingTipChordM > 0 && v.wingRootChordM >= v.wingTipChordM, 'visual wing chords must satisfy root >= tip > 0'],
    [isColor(v.colors.primary), 'visual.colors.primary must be #rrggbb'],
    [isColor(v.colors.secondary), 'visual.colors.secondary must be #rrggbb'],
    [isColor(v.colors.accent), 'visual.colors.accent must be #rrggbb'],
    [validRange(c.performance.topSpeedMach11km), 'performance.topSpeedMach11km must be [min < max]'],
    [validRange(c.performance.topSpeedMachSeaLevel), 'performance.topSpeedMachSeaLevel must be [min < max]'],
    [validRange(c.performance.instantTurnDegS170), 'performance.instantTurnDegS170 must be [min < max]'],
    [validRange(c.performance.stallSpeedMs), 'performance.stallSpeedMs must be [min < max]'],
  ];
  return checks.filter(([ok]) => !ok).map(([, message]) => message);
}

export function assertValidAircraftConfig(c: AircraftConfig): void {
  const problems = validateAircraftConfig(c);
  if (problems.length > 0) {
    throw new Error(`Invalid aircraft config "${c.id}":\n- ${problems.join('\n- ')}`);
  }
}
