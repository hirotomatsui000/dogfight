/** A break about this long before impact beats the missile (spec §10.2); a human needs a moment to react. */
const TURN_NOW_S = 2;

export interface MissileAdvice {
  text: string;
  /** flash it big: the moment to act is now */
  urgent: boolean;
}

/** What the HUD tells the pilot to do about the missile that will arrive first. */
export function missileAdvice(timeToImpactS: number): MissileAdvice {
  if (timeToImpactS <= TURN_NOW_S) return { text: 'TURN HARD NOW', urgent: true };
  return { text: 'X  FLARES  ·  BREAK WHEN IT IS CLOSE', urgent: false };
}
