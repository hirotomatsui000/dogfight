import { loadSetting, saveSetting } from './ui/storage.ts';

/**
 * Career records (revision 17): totals, personal bests and recent matches, kept in this browser's storage. No account:
 * clearing the site's data erases them.
 */

export type MatchOutcome = 'win' | 'loss' | 'draw';

/** One finished match from the local pilot's side. */
export interface MatchRecord {
  /** ISO date and time the match ended */
  at: string;
  /** the mission (team-deathmatch, air-superiority, team-objective, strike) */
  mode: string;
  /** the jet flown at the end */
  aircraftId: string;
  result: MatchOutcome;
  kills: number;
  deaths: number;
  sentinels: number;
  missilesFired: number;
  missileHits: number;
  gunHits: number;
  damage: number;
  airborneS: number;
  distanceM: number;
  bestStreak: number;
  longestLifeS: number;
  topSpeedMs: number;
  /** kills and deaths by the jet flown at the time */
  jets: Readonly<Record<string, { kills: number; deaths: number }>>;
  /** pilots per side and the opponents' skill */
  teamSize: number;
  difficulty: string;
}

export type BestId = 'kills' | 'streak' | 'damage' | 'life' | 'speed';
export const BEST_IDS: readonly BestId[] = ['kills', 'streak', 'damage', 'life', 'speed'];

export interface Best {
  value: number;
  aircraftId: string;
  mode: string;
  at: string;
}

export interface RecentMatch {
  at: string;
  mode: string;
  aircraftId: string;
  result: MatchOutcome;
  kills: number;
  deaths: number;
  teamSize: number;
  difficulty: string;
}

export interface Career {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  deaths: number;
  sentinels: number;
  missilesFired: number;
  missileHits: number;
  gunHits: number;
  damage: number;
  airborneS: number;
  distanceM: number;
  modes: Record<string, { matches: number; wins: number }>;
  jets: Record<string, { matches: number; kills: number; deaths: number }>;
  bests: Partial<Record<BestId, Best>>;
  /** newest first, at most RECENT_MAX */
  recent: RecentMatch[];
}

export const RECENT_MAX = 10;
const STORAGE_KEY = 'career';
const TOTALS = ['matches', 'wins', 'losses', 'draws', 'kills', 'deaths', 'sentinels', 'missilesFired', 'missileHits', 'gunHits', 'damage', 'airborneS', 'distanceM'] as const;
const OUTCOMES: readonly MatchOutcome[] = ['win', 'loss', 'draw'];

export function emptyCareer(): Career {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    kills: 0,
    deaths: 0,
    sentinels: 0,
    missilesFired: 0,
    missileHits: 0,
    gunHits: 0,
    damage: 0,
    airborneS: 0,
    distanceM: 0,
    modes: {},
    jets: {},
    bests: {},
    recent: [],
  };
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 64) : '');
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function sanitizeTable<K extends string>(raw: unknown, keys: readonly K[]): Record<string, Record<K, number>> {
  const out: Record<string, Record<K, number>> = {};
  if (!isRecord(raw)) return out;
  for (const [id, row] of Object.entries(raw)) {
    if (!isRecord(row) || id.length > 64) continue;
    out[id] = Object.fromEntries(keys.map((k) => [k, count(row[k])])) as Record<K, number>;
  }
  return out;
}

/** Whatever storage held (an older version, hand edits, garbage) as a valid career; anything unreadable counts as 0. */
export function sanitizeCareer(raw: unknown): Career {
  const c = emptyCareer();
  if (!isRecord(raw)) return c;
  for (const k of TOTALS) c[k] = count(raw[k]);
  c.modes = sanitizeTable(raw.modes, ['matches', 'wins'] as const);
  c.jets = sanitizeTable(raw.jets, ['matches', 'kills', 'deaths'] as const);
  if (isRecord(raw.bests)) {
    for (const id of BEST_IDS) {
      const b = raw.bests[id];
      if (isRecord(b) && count(b.value) > 0) c.bests[id] = { value: count(b.value), aircraftId: text(b.aircraftId), mode: text(b.mode), at: text(b.at) };
    }
  }
  if (Array.isArray(raw.recent)) {
    for (const r of raw.recent.slice(0, RECENT_MAX)) {
      if (!isRecord(r) || !OUTCOMES.includes(r.result as MatchOutcome)) continue;
      c.recent.push({
        at: text(r.at),
        mode: text(r.mode),
        aircraftId: text(r.aircraftId),
        result: r.result as MatchOutcome,
        kills: count(r.kills),
        deaths: count(r.deaths),
        teamSize: Math.max(1, count(r.teamSize)),
        difficulty: text(r.difficulty),
      });
    }
  }
  return c;
}

/** A match's value for one personal best. */
export function bestValue(m: MatchRecord, id: BestId): number {
  switch (id) {
    case 'kills':
      return m.kills;
    case 'streak':
      return m.bestStreak;
    case 'damage':
      return m.damage;
    case 'life':
      return m.longestLifeS;
    case 'speed':
      return m.topSpeedMs;
  }
}

/**
 * The career with one more match added, and the personal bests it beat (a first value for a best is recorded but not
 * counted as beating anything). Values under 1 never count. Does not change `career`.
 */
export function recordMatch(career: Career, m: MatchRecord): { career: Career; newBests: BestId[] } {
  const c = sanitizeCareer(career);
  c.matches++;
  if (m.result === 'win') c.wins++;
  else if (m.result === 'loss') c.losses++;
  else c.draws++;
  for (const k of ['kills', 'deaths', 'sentinels', 'missilesFired', 'missileHits', 'gunHits', 'damage', 'airborneS', 'distanceM'] as const) c[k] += count(m[k]);
  const mode = (c.modes[m.mode] ??= { matches: 0, wins: 0 });
  mode.matches++;
  if (m.result === 'win') mode.wins++;
  const flown = new Set([...Object.keys(m.jets), m.aircraftId]);
  for (const id of flown) {
    const jet = (c.jets[id] ??= { matches: 0, kills: 0, deaths: 0 });
    jet.matches++;
    jet.kills += count(m.jets[id]?.kills);
    jet.deaths += count(m.jets[id]?.deaths);
  }
  const newBests: BestId[] = [];
  for (const id of BEST_IDS) {
    const value = count(bestValue(m, id));
    const old = c.bests[id];
    if (value >= 1 && value > (old?.value ?? 0)) {
      c.bests[id] = { value, aircraftId: m.aircraftId, mode: m.mode, at: m.at };
      if (old) newBests.push(id);
    }
  }
  const { at, mode: modeId, aircraftId, result, kills, deaths, teamSize, difficulty } = m;
  c.recent = [{ at, mode: modeId, aircraftId, result, kills, deaths, teamSize, difficulty }, ...c.recent].slice(0, RECENT_MAX);
  return { career: c, newBests };
}

export function loadCareer(): Career {
  return sanitizeCareer(loadSetting<unknown>(STORAGE_KEY, null));
}

export function saveCareer(c: Career): void {
  saveSetting(STORAGE_KEY, c);
}
