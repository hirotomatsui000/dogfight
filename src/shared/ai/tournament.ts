import { listAircraft } from '../data/aircraft/registry.ts';
import type { MapDefinition } from '../data/maps/map-definition.ts';
import type { Terrain } from '../map/terrain.ts';
import { DIFFICULTIES, type DifficultyProfile } from './difficulty.ts';
import { runDuel } from './duel.ts';

/** Every pairing must win 35–65% of its decided duels (spec §9.4). */
export const BALANCE_RANGE: readonly [number, number] = [0.35, 0.65];
/**
 * About 60% of Ace-vs-Ace duels end undecided after three minutes, so the tournament runs 100 seeds per pairing to
 * get some 40 decided duels each (spec §9.4 says 50; revision 10 doubles it).
 */
export const SEEDS_PER_PAIRING = 100;

export interface PairingResult {
  usa: string;
  russia: string;
  usaWins: number;
  russiaWins: number;
  draws: number;
}

/** Each USA jet against each Russian jet. */
export function allPairings(): [usa: string, russia: string][] {
  const out: [string, string][] = [];
  for (const u of listAircraft('usa')) for (const r of listAircraft('russia')) out.push([u.id, r.id]);
  return out;
}

/** The USA side's share of the duels that ended in a kill; 0.5 when none did. */
export function usaWinRate(r: PairingResult): number {
  const decided = r.usaWins + r.russiaWins;
  return decided === 0 ? 0.5 : r.usaWins / decided;
}

export function isBalanced(r: PairingResult, range: readonly [number, number] = BALANCE_RANGE): boolean {
  const rate = usaWinRate(r);
  return rate >= range[0] && rate <= range[1];
}

/**
 * The balance tournament (spec §9.4): two bots of one skill (Ace by default) from a neutral head-on start, one duel per
 * seed, until the first kill or three minutes.
 */
export function runPairing(map: MapDefinition, terrain: Terrain, usa: string, russia: string, seeds: readonly number[], profile: DifficultyProfile = DIFFICULTIES.ace): PairingResult {
  const result: PairingResult = { usa, russia, usaWins: 0, russiaWins: 0, draws: 0 };
  for (const seed of seeds) {
    const { winner } = runDuel(map, terrain, [{ aircraftId: usa, profile }, { aircraftId: russia, profile }], seed);
    if (winner === 0) result.usaWins++;
    else if (winner === 1) result.russiaWins++;
    else result.draws++;
  }
  return result;
}

/** Seeds first..first + n - 1. */
export function seedRange(n: number = SEEDS_PER_PAIRING, first = 1): number[] {
  return Array.from({ length: n }, (_, i) => i + first);
}

/** A plain-text table of the results, rows by USA jet and columns by Russian jet. */
export function formatTournament(results: readonly PairingResult[]): string {
  const usa = [...new Set(results.map((r) => r.usa))];
  const russia = [...new Set(results.map((r) => r.russia))];
  const cell = (r: PairingResult | undefined) => (r ? `${Math.round(usaWinRate(r) * 100)}%${isBalanced(r) ? ' ' : '!'}(${r.usaWins}-${r.russiaWins}-${r.draws})` : '');
  const lines = [['USA win rate', ...russia].map((s) => s.padEnd(18)).join('')];
  for (const u of usa) lines.push([u, ...russia.map((r) => cell(results.find((x) => x.usa === u && x.russia === r)))].map((s) => s.padEnd(18)).join(''));
  return lines.join('\n');
}
