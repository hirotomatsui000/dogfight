import type { SeekerTone } from '../audio/sound-mix.ts';

/** Every warning sound with its on-screen text (spec §24), so a player without sound misses nothing. */
export type WarningSound = Exclude<SeekerTone, 'none'> | 'missile-warning' | 'hit-taken' | 'rwr-lock';

export const WARNING_CAPTIONS: Readonly<Record<WarningSound, string>> = {
  growl: 'SRM TRK',
  lock: 'SRM LOCK',
  'radar-track': 'MRM TRK',
  'radar-lock': 'MRM LOCK',
  'missile-warning': 'MISSILE',
  'hit-taken': 'HIT',
  'rwr-lock': 'RADAR LOCK',
};
