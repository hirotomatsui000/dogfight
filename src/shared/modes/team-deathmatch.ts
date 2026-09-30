import { opposingTeam } from '../data/aircraft/registry.ts';
import type { TeamId } from '../data/aircraft/types.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { DeathCause } from '../world/events.ts';
import type { GameMode, ModeContext, ModeStatus } from './mode.ts';

export interface TeamDeathmatchOptions {
  scoreLimit: number;
  timeLimitS: number;
}

export const TEAM_DEATHMATCH_DEFAULTS: TeamDeathmatchOptions = { scoreLimit: 15, timeLimitS: 600 };

/**
 * Spec §13: every death of a team's aircraft gives the other team a point (so enemy kills score, and crashes help
 * the enemy). First to the score limit wins; otherwise the higher score when time runs out.
 */
export class TeamDeathmatchMode implements GameMode {
  readonly id = 'team-deathmatch' as const;
  readonly combatEnabled = true;
  readonly respawnDelayS = 5;
  readonly options: TeamDeathmatchOptions;
  private readonly scores: Record<TeamId, number> = { usa: 0, russia: 0 };
  private winner: TeamId | 'draw' | null = null;
  private startTick: number | null = null;

  constructor(options: Partial<TeamDeathmatchOptions> = {}) {
    this.options = { ...TEAM_DEATHMATCH_DEFAULTS, ...options };
  }

  onAircraftDestroyed(_ctx: ModeContext, victim: AircraftEntity, _killer: AircraftEntity | null, _cause: DeathCause): void {
    if (this.winner) return;
    const team = opposingTeam(victim.team);
    this.scores[team]++;
    if (this.scores[team] >= this.options.scoreLimit) this.winner = team;
  }

  update(ctx: ModeContext): void {
    if (this.startTick === null) this.startTick = ctx.tick;
    if (this.winner || this.timeLeftS(ctx) > 0) return;
    const { usa, russia } = this.scores;
    this.winner = usa === russia ? 'draw' : usa > russia ? 'usa' : 'russia';
  }

  status(ctx: ModeContext): ModeStatus {
    return {
      modeId: this.id,
      label: 'Team Deathmatch',
      scores: { ...this.scores },
      timeLeftS: this.timeLeftS(ctx),
      winner: this.winner,
    };
  }

  private timeLeftS(ctx: ModeContext): number {
    const elapsed = this.startTick === null ? 0 : (ctx.tick - this.startTick) / ctx.tickRate;
    return Math.max(0, this.options.timeLimitS - elapsed);
  }
}
