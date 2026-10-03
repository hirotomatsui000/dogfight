import type { DifficultyId } from '../../shared/ai/difficulty.ts';
import { opposingTeam } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import type { MapId } from '../../shared/data/maps/registry.ts';
import { STRIKE_DEFENDER } from '../../shared/modes/strike.ts';
import type { SpawnStart } from '../../shared/world/spawns.ts';
import { START_HOURS, type TimeOfDayId } from '../../shared/world/time-of-day.ts';
import type { WeatherId } from '../../shared/world/weather.ts';

/** The modes a campaign mission can fly: every one that ends with a winner. */
export type CampaignMode = 'team-deathmatch' | 'air-superiority' | 'team-objective' | 'strike';

/** One mission of the campaign (revision 18), from the point of view of whichever side the player flies for. */
export interface CampaignMission {
  id: string;
  title: string;
  /** the briefing for a pilot of `side`, with the sides already named */
  briefing(side: TeamId): string;
  mode: CampaignMode;
  /** Strike always flies on the test range */
  map: MapId;
  start: SpawnStart;
  time: TimeOfDayId;
  weather: WeatherId;
  /** pilots on the player's side, the player included */
  allies: number;
  enemies: number;
  difficulty: DifficultyId;
  wingmenDifficulty: DifficultyId;
  /** first to this score; the mode's own limit when unset */
  scoreLimit?: number;
  /** the jet the briefing suggests for each side */
  jet: Readonly<Record<TeamId, string>>;
  /** different numbers for one side, where the mode favours the other (Strike, Team Objective) */
  sides?: Partial<Record<TeamId, Partial<MissionSetup>>>;
}

/** The numbers a mission is flown with. */
export interface MissionSetup {
  allies: number;
  enemies: number;
  difficulty: DifficultyId;
  wingmenDifficulty: DifficultyId;
  scoreLimit: number | undefined;
}

/** {us} is the pilot's country, {them} the other side as an adjective ("three Russian jets"). */
const COUNTRY: Readonly<Record<TeamId, string>> = { usa: 'the USA', russia: 'Russia' };
const ADJECTIVE: Readonly<Record<TeamId, string>> = { usa: 'American', russia: 'Russian' };
const fill = (text: string, side: TeamId) => text.replaceAll('{us}', COUNTRY[side]).replaceAll('{them}', ADJECTIVE[opposingTeam(side)]);
const say = (text: string) => (side: TeamId) => fill(text, side);

/** The campaign: nine missions over Lechovia, each unlocked by clearing the one before (revision 18). */
export const CAMPAIGN: readonly CampaignMission[] = [
  {
    id: 'first-sortie',
    title: 'First Sortie',
    briefing: say(
      'A single {them} fighter keeps crossing into Lechovian airspace. Go up alone and chase it off for good: the first to three kills wins. It comes back after every kill, and so do you.',
    ),
    mode: 'team-deathmatch',
    map: 'lechovia',
    start: 'air',
    time: 'day',
    weather: 'clear',
    allies: 1,
    enemies: 1,
    difficulty: 'rookie',
    wingmenDifficulty: 'rookie',
    scoreLimit: 3,
    jet: { usa: 'kestrel', russia: 'kobchik' },
  },
  {
    id: 'two-ship',
    title: 'Two-Ship',
    briefing: say(
      'The {them} side now flies in pairs, and so do you: a veteran wingman joins you. Keep together under the scattered cloud and be first to five kills.',
    ),
    mode: 'team-deathmatch',
    map: 'lechovia',
    start: 'air',
    time: 'day',
    weather: 'scattered',
    allies: 2,
    enemies: 2,
    difficulty: 'rookie',
    wingmenDifficulty: 'veteran',
    scoreLimit: 5,
    jet: { usa: 'kestrel', russia: 'kobchik' },
  },
  {
    id: 'lake-district',
    title: 'The Lake District',
    briefing: say(
      'At dawn both sides race for the three zones over the lakes. Hold more of them than the {them} pilots do: every zone you own scores a point every two seconds. First to 120.',
    ),
    mode: 'air-superiority',
    map: 'lechovia',
    start: 'air',
    time: 'dawn',
    weather: 'broken',
    allies: 2,
    enemies: 2,
    difficulty: 'veteran',
    wingmenDifficulty: 'veteran',
    scoreLimit: 120,
    jet: { usa: 'tempest', russia: 'yastreb' },
  },
  {
    id: 'outnumbered',
    title: 'Outnumbered',
    briefing: say(
      'Three {them} jets catch you and your wingman at dusk. They are green pilots, but there are more of them: pick your fights, use the clouds, and be first to six kills.',
    ),
    mode: 'team-deathmatch',
    map: 'lechovia',
    start: 'air',
    time: 'dusk',
    weather: 'scattered',
    allies: 2,
    enemies: 3,
    difficulty: 'rookie',
    wingmenDifficulty: 'veteran',
    scoreLimit: 6,
    jet: { usa: 'condor', russia: 'sapsan' },
  },
  {
    id: 'strike',
    title: 'Strike Package',
    briefing: (side) =>
      side === STRIKE_DEFENDER
        ? fill(
            'An ace {them} bomber pilot is heading for the three targets on the test range. With your wingman, keep at least two of them standing for nine minutes, or shoot the bomber down until it runs out of aircraft.',
            side,
          )
        : fill(
            'Go in alone, low and level over the test range, and bomb its three targets: destroy two of them before the nine minutes run out. One {them} fighter will try to stop you. Press G to drop when RELEASE flashes.',
            side,
          ),
    mode: 'strike',
    map: 'test-range',
    start: 'air',
    time: 'day',
    weather: 'clear',
    allies: 2,
    enemies: 2,
    difficulty: 'veteran',
    wingmenDifficulty: 'veteran',
    jet: { usa: 'kestrel', russia: 'sapsan' },
    // Bombers have the edge in Strike as soon as they have a wingman: one bomber against two defenders, or one on one.
    sides: { usa: { enemies: 1, difficulty: 'ace' }, russia: { allies: 1, enemies: 1 } },
  },
  {
    id: 'night-hunters',
    title: 'Night Hunters',
    briefing: say(
      'Three against three after dark, with two aces on your wing. Towns and runways are lit, jets show their navigation lights, and the radar does the rest. First to five kills.',
    ),
    mode: 'team-deathmatch',
    map: 'lechovia',
    start: 'air',
    time: 'night',
    weather: 'clear',
    allies: 3,
    enemies: 3,
    difficulty: 'veteran',
    wingmenDifficulty: 'ace',
    scoreLimit: 5,
    jet: { usa: 'shade', russia: 'prizrak' },
  },
  {
    id: 'eyes-in-the-sky',
    title: 'Eyes in the Sky',
    briefing: say(
      'Each side has two Sentinel radar planes orbiting behind its lines. Guard yours and hunt theirs under the overcast: +20 for each one, and every fighter down is worth a point. First to 40.',
    ),
    mode: 'team-objective',
    map: 'lechovia',
    start: 'air',
    time: 'day',
    weather: 'overcast',
    allies: 3,
    enemies: 3,
    difficulty: 'veteran',
    wingmenDifficulty: 'veteran',
    scoreLimit: 40,
    jet: { usa: 'shade', russia: 'prizrak' },
    // Team Objective favours the Russian jets' heavier missile load: the USA side meets rookies.
    sides: { usa: { difficulty: 'rookie' } },
  },
  {
    id: 'storm-front',
    title: 'Storm Front',
    briefing: say(
      'A storm rolls over the front and the {them} aces scramble into it. Take off from your base through the rain and win the three zones: first to 200.',
    ),
    mode: 'air-superiority',
    map: 'lechovia',
    start: 'runway',
    time: 'day',
    weather: 'rain',
    allies: 4,
    enemies: 4,
    difficulty: 'ace',
    wingmenDifficulty: 'ace',
    scoreLimit: 200,
    jet: { usa: 'tempest', russia: 'yastreb' },
  },
  {
    id: 'last-light',
    title: 'Last Light',
    briefing: say(
      'Everything both sides have left goes up at dusk: four aces a side and two Sentinels each. Win this and the skies over Lechovia belong to {us}. First to 60.',
    ),
    mode: 'team-objective',
    map: 'lechovia',
    start: 'air',
    time: 'dusk',
    weather: 'scattered',
    allies: 4,
    enemies: 4,
    difficulty: 'ace',
    wingmenDifficulty: 'ace',
    scoreLimit: 60,
    jet: { usa: 'shade', russia: 'prizrak' },
  },
];

/** A mission's sides, skills and score limit for a pilot of `side`. */
export function missionSetup(m: CampaignMission, side: TeamId): MissionSetup {
  return { allies: m.allies, enemies: m.enemies, difficulty: m.difficulty, wingmenDifficulty: m.wingmenDifficulty, scoreLimit: m.scoreLimit, ...m.sides?.[side] };
}

export function missionById(id: string): CampaignMission | undefined {
  return CAMPAIGN.find((m) => m.id === id);
}

export function missionIndex(id: string): number {
  return CAMPAIGN.findIndex((m) => m.id === id);
}

/** The local hour a mission starts at. */
export function missionHour(m: CampaignMission): number {
  return START_HOURS[m.time];
}
