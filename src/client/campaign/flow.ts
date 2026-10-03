import { DIFFICULTIES } from '../../shared/ai/difficulty.ts';
import { listAircraft } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { MAP_NAMES } from '../../shared/data/maps/registry.ts';
import { STRIKE_DEFAULTS } from '../../shared/modes/strike.ts';
import { TIME_OF_DAY_LABELS } from '../../shared/world/time-of-day.ts';
import { WEATHER } from '../../shared/world/weather.ts';
import type { ControlMode } from '../input/control-mapper.ts';
import type { StartOptions } from '../ui/menu.ts';
import { MISSION_LABELS } from '../ui/records-format.ts';
import { CAMPAIGN, type CampaignMission, missionHour, missionIndex, missionSetup } from './missions.ts';
import { type CampaignProgress, clearedCount, missionProgress, recordAttempt } from './progress.ts';

/** The pilot's own choices a campaign mission keeps. */
export interface CampaignPilot {
  aircraftId: string;
  callsign: string;
  controlMode: ControlMode;
}

/** "Mission 3 of 9 · The Lake District" */
export function missionHeading(m: CampaignMission): string {
  return `Mission ${missionIndex(m.id) + 1} of ${CAMPAIGN.length} · ${m.title}`;
}

/** The briefing's facts for a pilot of `side`: mode, place and weather, the sides, and how the mission is won. */
export function missionFacts(m: CampaignMission, side: TeamId): string[] {
  const k = missionSetup(m, side);
  const goal =
    m.mode === 'strike'
      ? `${STRIKE_DEFAULTS.timeLimitS / 60} minutes`
      : k.scoreLimit === undefined
        ? null
        : m.mode === 'team-deathmatch'
          ? `First to ${k.scoreLimit} kills`
          : `First to ${k.scoreLimit} points`;
  const sides = k.allies > 1 ? `${k.allies} v ${k.enemies} · ${DIFFICULTIES[k.wingmenDifficulty].label} wingmen` : `${k.allies} v ${k.enemies}`;
  return [
    MISSION_LABELS[m.mode],
    `${MAP_NAMES[m.map]} · ${TIME_OF_DAY_LABELS[m.time]} · ${WEATHER[m.weather].label}${m.start === 'runway' ? ' · Runway start' : ''}`,
    `${sides} · ${DIFFICULTIES[k.difficulty].label} opponents`,
    ...(goal ? [goal] : []),
  ];
}

/** The match a campaign mission flies for a pilot of `side`. A jet that is not one of the side's fighters is swapped for the suggested one. */
export function campaignStart(m: CampaignMission, side: TeamId, pilot: CampaignPilot): StartOptions {
  const setup = missionSetup(m, side);
  const aircraftId = listAircraft(side).some((a) => a.id === pilot.aircraftId) ? pilot.aircraftId : m.jet[side];
  return {
    aircraftId,
    callsign: pilot.callsign,
    controlMode: pilot.controlMode,
    mission: m.mode,
    difficulty: setup.difficulty,
    wingmenDifficulty: setup.wingmenDifficulty,
    map: m.map,
    start: m.start,
    // The clock stands still: a mission flies in the light its briefing promises.
    environment: { weather: m.weather, startHour: missionHour(m), clockRunning: false },
    teamSize: setup.allies,
    enemies: setup.enemies,
    scoreLimit: setup.scoreLimit,
    campaign: { missionId: m.id },
  };
}

/** What the end screen says after a campaign mission, and what its main button flies next. */
export interface CampaignOutcome {
  progress: CampaignProgress;
  title: string;
  kicker: string;
  highlights: string[];
  againLabel: string;
  /** the next mission and its briefing after a win; null to fly the same mission again */
  next: { mission: CampaignMission; heading: string; briefing: string; aircraftId: string } | null;
}

/**
 * Records one finished run of a campaign mission and works out the end screen: a win opens the next mission (its
 * suggested jet, unless the pilot chose their own for this one); anything else offers a retry. Draws do not clear.
 */
export function campaignOutcome(
  p: CampaignProgress,
  side: TeamId,
  mission: CampaignMission,
  aircraftId: string,
  won: boolean,
  kills: number,
  deaths: number,
): CampaignOutcome {
  const wasCleared = missionProgress(p, side, mission.id).cleared;
  const progress = recordAttempt(p, side, mission.id, won, kills, deaths);
  const index = missionIndex(mission.id);
  const last = index === CAMPAIGN.length - 1;
  const kicker = `Campaign · ${missionHeading(mission)}`;
  if (!won) return { progress, title: 'Mission failed', kicker, highlights: [], againLabel: 'Retry mission', next: null };
  const highlights: string[] = [];
  const attempts = missionProgress(progress, side, mission.id).attempts;
  if (!wasCleared) highlights.push(`Cleared ${attempts === 1 ? 'on the first attempt' : `after ${attempts} attempts`} · ${clearedCount(progress, side)} of ${CAMPAIGN.length}`);
  if (last) {
    if (!wasCleared) highlights.push(`Every mission cleared for ${side === 'usa' ? 'the USA' : 'Russia'}`);
    return { progress, title: 'Campaign complete', kicker, highlights, againLabel: 'Fly it again', next: null };
  }
  const next = CAMPAIGN[index + 1];
  const keepOwn = aircraftId !== mission.jet[side];
  return {
    progress,
    title: 'Mission complete',
    kicker,
    highlights,
    againLabel: 'Next mission',
    next: { mission: next, heading: `Next · ${missionHeading(next)}`, briefing: next.briefing(side), aircraftId: keepOwn ? aircraftId : next.jet[side] },
  };
}
