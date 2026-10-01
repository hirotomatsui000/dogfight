import type { TeamId } from '../data/aircraft/types.ts';

/** Fictional bot callsigns per team; bots show as "[BOT] name" (spec §7). */
export const BOT_CALLSIGNS: Readonly<Record<TeamId, readonly string[]>> = {
  usa: ['Ranger', 'Saber', 'Comet', 'Atlas', 'Falcon', 'Vortex', 'Talon', 'Nomad'],
  russia: ['Grom', 'Burya', 'Sokol', 'Vityaz', 'Berkut', 'Strizh', 'Krechet', 'Orlan'],
};

export function botCallsign(team: TeamId, index: number): string {
  const names = BOT_CALLSIGNS[team];
  return `[BOT] ${names[index % names.length]}`;
}
