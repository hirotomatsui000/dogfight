import { opposingTeam, TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import type { ObjectiveStatus, ZoneStatus } from '../../shared/modes/mode.ts';
import { formatClock } from './format.ts';

export type Side = 'mine' | 'theirs' | 'neutral';

/** Whose a zone is, from the local pilot's side. */
export function zoneSide(owner: TeamId | null, mine: TeamId): Side {
  return owner === null ? 'neutral' : owner === mine ? 'mine' : 'theirs';
}

/** Progress toward the local side: −1 the enemy owns it … +1 we own it. */
export function progressForMe(zone: ZoneStatus, mine: TeamId): number {
  return mine === 'usa' ? zone.progress : -zone.progress;
}

/**
 * The line shown while the local pilot is inside a zone (spec §15.2): holding it, capturing it (with how far), taking
 * it off the enemy first, a tie, or being outnumbered.
 */
export function zoneActivity(zone: ZoneStatus, mine: TeamId): string {
  const theirs = opposingTeam(mine);
  const us = zone.inside[mine];
  const them = zone.inside[theirs];
  if (us === them) return `ZONE ${zone.id} CONTESTED`;
  if (us < them) return `ZONE ${zone.id} OUTNUMBERED ${us}:${them}`;
  if (zone.owner === mine) return `HOLDING ZONE ${zone.id}`;
  const s = progressForMe(zone, mine);
  return s < 0 ? `NEUTRALIZING ZONE ${zone.id} ${Math.round((1 + s) * 100)}%` : `CAPTURING ZONE ${zone.id} ${Math.round(s * 100)}%`;
}

/** Banner for a zone changing hands (event `zone`). */
export function zoneEventText(zoneId: string, owner: TeamId | null, previous: TeamId | null, mine: TeamId): string {
  if (owner === mine) return `ZONE ${zoneId} CAPTURED`;
  if (owner !== null) return `ZONE ${zoneId} TAKEN BY ${TEAM_NAMES[owner].toUpperCase()}`;
  return previous === mine ? `ZONE ${zoneId} LOST` : `ZONE ${zoneId} NEUTRALIZED`;
}

/** Kill-feed line for a zone changing hands. */
export function zoneFeedText(zoneId: string, owner: TeamId | null, previous: TeamId | null): string {
  if (owner !== null) return `${TEAM_NAMES[owner]} captured zone ${zoneId}`;
  return `${previous ? TEAM_NAMES[previous] : 'A side'} lost zone ${zoneId}`;
}

/** Banner when a Sentinel goes down. */
export function sentinelDownText(victimTeam: TeamId, mine: TeamId): string {
  return victimTeam === mine ? 'OUR SENTINEL IS DOWN · DATALINK LOST' : 'ENEMY SENTINEL DOWN · THEIR DATALINK IS OUT';
}

/** "SENTINELS 2 : 1" and the datalink state, under the score (Team Objective). */
export function objectiveLines(o: ObjectiveStatus, mine: TeamId): [text: string, side: Side][][] {
  const theirs = opposingTeam(mine);
  const alive = (t: TeamId) => o.sentinels.filter((s) => s.team === t && s.alive).length;
  const lines: [string, Side][][] = [
    [
      ['SENTINELS ', 'neutral'],
      [String(alive(mine)), 'mine'],
      [' : ', 'neutral'],
      [String(alive(theirs)), 'theirs'],
    ],
  ];
  if (o.datalinkDownS[mine] > 0) lines.push([[`DATALINK DOWN ${formatClock(o.datalinkDownS[mine])}`, 'theirs']]);
  if (o.datalinkDownS[theirs] > 0) lines.push([[`ENEMY DATALINK DOWN ${formatClock(o.datalinkDownS[theirs])}`, 'mine']]);
  return lines;
}

/** The rules of a mission in one line, for the title screen (M5). */
export const MISSION_RULES: Readonly<Record<'air-superiority' | 'team-objective', string>> = {
  'air-superiority': 'Take and hold zones A, B and C: each zone you own scores a point every 2 s. First to 300.',
  'team-objective': 'Guard your two Sentinel radar planes, shoot down theirs: +20 each, and their datalink fails for 60 s. Every jet carries 4 Lances. First to 60.',
};
