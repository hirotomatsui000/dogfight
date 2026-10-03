import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { loadSetting, saveSetting } from '../ui/storage.ts';
import { CAMPAIGN } from './missions.ts';

/** How a pilot has done on one mission (revision 18). */
export interface MissionProgress {
  cleared: boolean;
  attempts: number;
  /** most kills in one cleared run */
  bestKills: number;
  /** fewest deaths in one cleared run; null until cleared */
  fewestDeaths: number | null;
}

/** Campaign progress for each side, and the side last flown for. Kept in this browser like the records. */
export interface CampaignProgress {
  side: TeamId;
  sides: Record<TeamId, Record<string, MissionProgress>>;
}

const STORAGE_KEY = 'campaign';
const TEAMS: readonly TeamId[] = ['usa', 'russia'];

export function emptyCampaign(): CampaignProgress {
  return { side: 'usa', sides: { usa: {}, russia: {} } };
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whatever storage held as valid progress: unknown missions are dropped, unreadable numbers count as 0. */
export function sanitizeCampaign(raw: unknown): CampaignProgress {
  const p = emptyCampaign();
  if (!isRecord(raw)) return p;
  if (raw.side === 'russia') p.side = 'russia';
  const sides = isRecord(raw.sides) ? raw.sides : {};
  for (const team of TEAMS) {
    const missions = isRecord(sides[team]) ? sides[team] : {};
    for (const m of CAMPAIGN) {
      const r = missions[m.id];
      if (!isRecord(r)) continue;
      const cleared = r.cleared === true;
      p.sides[team][m.id] = {
        cleared,
        attempts: count(r.attempts),
        bestKills: count(r.bestKills),
        fewestDeaths: cleared && typeof r.fewestDeaths === 'number' && Number.isFinite(r.fewestDeaths) ? Math.max(0, Math.floor(r.fewestDeaths)) : null,
      };
    }
  }
  return p;
}

export function missionProgress(p: CampaignProgress, side: TeamId, missionId: string): MissionProgress {
  return p.sides[side][missionId] ?? { cleared: false, attempts: 0, bestKills: 0, fewestDeaths: null };
}

/** The first mission is always open; each later one opens once the one before it is cleared. */
export function isUnlocked(p: CampaignProgress, side: TeamId, index: number): boolean {
  return index === 0 || (index > 0 && index < CAMPAIGN.length && missionProgress(p, side, CAMPAIGN[index - 1].id).cleared);
}

export function clearedCount(p: CampaignProgress, side: TeamId): number {
  return CAMPAIGN.filter((m) => missionProgress(p, side, m.id).cleared).length;
}

/** The mission to offer next: the first open one not yet cleared, or the last once all are. */
export function nextMissionIndex(p: CampaignProgress, side: TeamId): number {
  const i = CAMPAIGN.findIndex((m, k) => isUnlocked(p, side, k) && !missionProgress(p, side, m.id).cleared);
  return i < 0 ? CAMPAIGN.length - 1 : i;
}

/** Progress after one finished run of a mission. Does not change `p`. */
export function recordAttempt(p: CampaignProgress, side: TeamId, missionId: string, won: boolean, kills: number, deaths: number): CampaignProgress {
  const next = sanitizeCampaign(p);
  next.side = side;
  const old = missionProgress(next, side, missionId);
  next.sides[side][missionId] = {
    cleared: old.cleared || won,
    attempts: old.attempts + 1,
    bestKills: won ? Math.max(old.bestKills, kills) : old.bestKills,
    fewestDeaths: won ? Math.min(old.fewestDeaths ?? Infinity, deaths) : old.fewestDeaths,
  };
  return next;
}

export function loadCampaign(): CampaignProgress {
  return sanitizeCampaign(loadSetting<unknown>(STORAGE_KEY, null));
}

export function saveCampaign(p: CampaignProgress): void {
  saveSetting(STORAGE_KEY, p);
}
