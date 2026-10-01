import type { Vector3 } from 'three';
import { TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { BOMB_ANVIL } from '../../shared/data/weapons.ts';
import type { StrikeStatus } from '../../shared/modes/mode.ts';
import type { GroundTargetView } from '../session/game-session.ts';
import { formatClock } from './format.ts';

export type StrikeTextPart = readonly [text: string, side: 'mine' | 'theirs' | 'neutral'];

/** A target's "UNDER ATTACK" banner repeats at most this often (spec §15.2). */
export const UNDER_ATTACK_REPEAT_S = 3;

/** The Strike status line: clock, targets standing, aircraft left per team (spec §15.2). */
export function strikeStatusParts(s: StrikeStatus, timeLeftS: number, standing: number, total: number, localTeam: TeamId): StrikeTextPart[] {
  const other = localTeam === s.attacker ? s.defender : s.attacker;
  return [
    [formatClock(timeLeftS), 'neutral'],
    [`   TARGETS ${standing}/${total}`, 'neutral'],
    ['   AIRCRAFT ', 'neutral'],
    [`${TEAM_NAMES[localTeam].toUpperCase()} ${s.aircraftLeft[localTeam]}`, 'mine'],
    ['  ', 'neutral'],
    [`${TEAM_NAMES[other].toUpperCase()} ${s.aircraftLeft[other]}`, 'theirs'],
  ];
}

/** True while the predicted impact point lies within a standing target's full-damage radius. */
export function releaseCue(impact: Vector3 | null, targets: readonly GroundTargetView[]): boolean {
  if (!impact) return false;
  for (const t of targets) {
    if (!t.destroyed && Math.hypot(impact.x - t.position.x, impact.z - t.position.z) <= BOMB_ANVIL.fullDamageRadiusM) return true;
  }
  return false;
}

export function targetDestroyedText(targetId: string): string {
  return `TARGET ${targetId} DESTROYED`;
}

/** Defender banners for target hits, throttled per target. */
export class TargetAlerts {
  private readonly lastAlertS = new Map<string, number>();

  underAttack(targetId: string, nowS: number): string | null {
    const last = this.lastAlertS.get(targetId);
    if (last !== undefined && nowS - last < UNDER_ATTACK_REPEAT_S) return null;
    this.lastAlertS.set(targetId, nowS);
    return `TARGET ${targetId} UNDER ATTACK`;
  }
}
