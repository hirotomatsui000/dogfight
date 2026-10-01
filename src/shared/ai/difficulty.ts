export type DifficultyId = 'rookie' | 'veteran' | 'ace';

/** Bot skill (spec §14). */
export interface DifficultyProfile {
  id: DifficultyId;
  label: string;
  /** how late the bot notices what other aircraft do */
  reactionS: number;
  /** standard deviation of the bot's aim error */
  aimNoiseDeg: number;
  /** largest stick pull the bot uses in a fight (0..1) */
  maxPull: number;
  /** chance to release countermeasures at each opportunity while a missile is inbound */
  countermeasureDiscipline: number;
  /** relative spread of the bot's guess at a missile's time to impact, so weaker pilots mistime their break */
  impactJudgementError: number;
  gunRangeM: number;
  /** the bot fires when its aim error is below this */
  fireThresholdDeg: number;
  /** RMS miss distance of this pilot's bomb releases (Strike) */
  bombErrorM: number;
}

export const DIFFICULTIES: Readonly<Record<DifficultyId, DifficultyProfile>> = {
  rookie: { id: 'rookie', label: 'Rookie', reactionS: 0.8, aimNoiseDeg: 3, maxPull: 0.7, countermeasureDiscipline: 0.4, impactJudgementError: 0.45, gunRangeM: 500, fireThresholdDeg: 2.5, bombErrorM: 35 },
  veteran: { id: 'veteran', label: 'Veteran', reactionS: 0.4, aimNoiseDeg: 1.5, maxPull: 0.85, countermeasureDiscipline: 0.8, impactJudgementError: 0.2, gunRangeM: 700, fireThresholdDeg: 1.5, bombErrorM: 18 },
  ace: { id: 'ace', label: 'Ace', reactionS: 0.15, aimNoiseDeg: 0.5, maxPull: 1, countermeasureDiscipline: 1, impactJudgementError: 0.07, gunRangeM: 900, fireThresholdDeg: 0.8, bombErrorM: 6 },
};
