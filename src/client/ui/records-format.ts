import { DIFFICULTIES, type DifficultyId } from '../../shared/ai/difficulty.ts';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import type { UnitSystem } from '../../shared/data/aircraft/types.ts';
import type { BestId, Career, MatchOutcome, RecentMatch } from '../career.ts';
import { formatClock, speedLabel, speedValue } from '../hud/format.ts';

/** How the missions are called on the title screen and in the records. */
export const MISSION_LABELS: Readonly<Record<string, string>> = {
  'team-deathmatch': 'Dogfight',
  'air-superiority': 'Air Superiority',
  'team-objective': 'Team Objective',
  strike: 'Strike',
  'free-flight': 'Free flight',
  training: 'Training',
};

export const BEST_LABELS: Readonly<Record<BestId, string>> = {
  kills: 'Most kills in a match',
  streak: 'Longest kill streak',
  damage: 'Most damage in a match',
  life: 'Longest life',
  speed: 'Top speed',
};

const OUTCOME_LABELS: Readonly<Record<MatchOutcome, string>> = { win: 'Victory', loss: 'Defeat', draw: 'Draw' };

const thousands = (n: number) => Math.round(n).toLocaleString('en-US');

/** A jet's name from its id; ids from older records that no longer exist read as themselves. */
export function aircraftName(id: string): string {
  try {
    return getAircraft(id).name;
  } catch {
    return id || '—';
  }
}

export function missionLabel(id: string): string {
  return MISSION_LABELS[id] ?? id;
}

/** A best's value as the HUD would show it: speed in the units of the jet it was set in. */
export function formatBestValue(id: BestId, value: number, units: UnitSystem): string {
  switch (id) {
    case 'kills':
    case 'streak':
      return String(Math.round(value));
    case 'damage':
      return thousands(value);
    case 'life':
      return formatClock(value);
    case 'speed':
      return `${thousands(speedValue(value, units))} ${speedLabel(units).toLowerCase()}`;
  }
}

function unitsOf(aircraftId: string): UnitSystem {
  try {
    return getAircraft(aircraftId).hudUnits;
  } catch {
    return 'metric';
  }
}

/** "Most kills in a match: 7", for the end screen's new bests. */
export function bestLine(id: BestId, value: number, aircraftId: string): string {
  return `${BEST_LABELS[id]}: ${formatBestValue(id, value, unitsOf(aircraftId))}`;
}

/** "2026-10-02" from an ISO time; empty when unreadable. */
export function formatDate(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
}

const ratio = (a: number, b: number) => (b > 0 ? (a / b).toFixed(2) : a > 0 ? '∞' : '—');
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : '—');

/** The totals block of the records sheet, as label and value. */
export function careerTotals(c: Career): [string, string][] {
  const hours = Math.floor(c.airborneS / 3600);
  const minutes = Math.floor((c.airborneS % 3600) / 60);
  return [
    ['Matches', c.matches > 0 ? `${c.matches} (${c.wins} won · ${c.losses} lost · ${c.draws} drawn)` : '0'],
    ['Win rate', percent(c.wins, c.matches)],
    ['Kills', String(c.kills)],
    ['Deaths', String(c.deaths)],
    ['Kills per death', ratio(c.kills, c.deaths)],
    ['Missiles', `${c.missilesFired} fired · ${c.missileHits} hit (${percent(c.missileHits, c.missilesFired)})`],
    ['Gun hits', String(c.gunHits)],
    ['Damage dealt', thousands(c.damage)],
    ['Sentinels shot down', String(c.sentinels)],
    ['Time in the air', hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`],
    ['Distance flown', `${thousands(c.distanceM / 1000)} km`],
  ];
}

/** One personal best per row: what, the value, the jet and the day. */
export function bestRows(c: Career): [string, string, string, string][] {
  return (Object.keys(BEST_LABELS) as BestId[]).flatMap((id) => {
    const b = c.bests[id];
    return b ? [[BEST_LABELS[id], formatBestValue(id, b.value, unitsOf(b.aircraftId)), aircraftName(b.aircraftId), formatDate(b.at)] as [string, string, string, string]] : [];
  });
}

/** "Dogfight · 2 v 2 · Veteran" for a recent match. */
export function recentLabel(r: RecentMatch): string {
  const skill = DIFFICULTIES[r.difficulty as DifficultyId]?.label ?? r.difficulty;
  return [missionLabel(r.mode), `${r.teamSize} v ${r.teamSize}`, skill].filter(Boolean).join(' · ');
}

export function outcomeLabel(r: MatchOutcome): string {
  return OUTCOME_LABELS[r];
}
