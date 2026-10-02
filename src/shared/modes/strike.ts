import type { TeamId } from '../data/aircraft/types.ts';
import type { GroundTargetSpec, MapDefinition, SpawnSpec, StrikeLayout } from '../data/maps/map-definition.ts';
import { BOMB_ANVIL } from '../data/weapons.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { GameMode, ModeContext, ModeStatus, StrikeEndReason } from './mode.ts';

export interface StrikeOptions {
  timeLimitS: number;
  aircraftPerTeam: number;
  targetsToWin: number;
}

/** Nine minutes since M3 (8 before): defenders' Lances slow the attack, and 9 minutes keeps the match even (§13.1). */
export const STRIKE_DEFAULTS: StrikeOptions = { timeLimitS: 540, aircraftPerTeam: 4, targetsToWin: 2 };
/** Aircraft per pilot on each team when a side has several pilots (M5). */
export const STRIKE_AIRCRAFT_PER_PILOT = 4;
/** Russia attacks and the USA defends (spec §13.1). */
export const STRIKE_ATTACKER: TeamId = 'russia';
export const STRIKE_DEFENDER: TeamId = 'usa';

function layoutOf(map: MapDefinition): StrikeLayout {
  if (!map.strike) throw new Error(`${map.name} has no Strike layout`);
  return map.strike;
}

function destroyedCount(ctx: ModeContext): number {
  let n = 0;
  for (const t of ctx.groundTargetList()) if (t.destroyed) n++;
  return n;
}

/**
 * Spec §13.1. Russia wins by destroying two targets or the USA's 4th aircraft; the USA wins on time or by destroying
 * Russia's 4th aircraft. The checks run once per tick in that order, so there are no draws.
 */
export class StrikeMode implements GameMode {
  readonly id = 'strike' as const;
  readonly combatEnabled = true;
  readonly respawnDelayS = 5;
  readonly options: StrikeOptions;
  private readonly losses: Record<TeamId, number> = { usa: 0, russia: 0 };
  private winner: TeamId | null = null;
  private reason: StrikeEndReason | null = null;
  private startTick: number | null = null;

  constructor(options: Partial<StrikeOptions> = {}) {
    this.options = { ...STRIKE_DEFAULTS, ...options };
  }

  spawnPoint(map: MapDefinition, team: TeamId): SpawnSpec {
    return layoutOf(map).spawns[team];
  }

  groundTargets(map: MapDefinition): readonly GroundTargetSpec[] {
    return layoutOf(map).targets;
  }

  bombLoad(team: TeamId): number {
    return team === STRIKE_ATTACKER ? BOMB_ANVIL.perAircraft : 0;
  }

  canRespawn(team: TeamId): boolean {
    return this.losses[team] < this.options.aircraftPerTeam;
  }

  onAircraftDestroyed(_ctx: ModeContext, victim: AircraftEntity): void {
    if (this.winner) return;
    this.losses[victim.team]++;
  }

  update(ctx: ModeContext): void {
    if (this.startTick === null) this.startTick = ctx.tick;
    if (this.winner) return;
    const o = this.options;
    if (destroyedCount(ctx) >= o.targetsToWin) return this.end(STRIKE_ATTACKER, 'targets-destroyed');
    // Checked first, so when both teams lose their last aircraft in the same tick the attack has failed.
    if (this.losses[STRIKE_ATTACKER] >= o.aircraftPerTeam) return this.end(STRIKE_DEFENDER, 'out-of-aircraft');
    if (this.losses[STRIKE_DEFENDER] >= o.aircraftPerTeam) return this.end(STRIKE_ATTACKER, 'out-of-aircraft');
    if (this.timeLeftS(ctx) <= 0) this.end(STRIKE_DEFENDER, 'targets-held');
  }

  status(ctx: ModeContext): ModeStatus {
    const o = this.options;
    return {
      modeId: this.id,
      label: 'Strike',
      scores: null,
      timeLeftS: this.timeLeftS(ctx),
      winner: this.winner,
      strike: {
        attacker: STRIKE_ATTACKER,
        defender: STRIKE_DEFENDER,
        aircraftLeft: {
          usa: Math.max(0, o.aircraftPerTeam - this.losses.usa),
          russia: Math.max(0, o.aircraftPerTeam - this.losses.russia),
        },
        targetsDestroyed: destroyedCount(ctx),
        targetsToWin: o.targetsToWin,
        reason: this.reason,
      },
    };
  }

  private end(winner: TeamId, reason: StrikeEndReason): void {
    this.winner = winner;
    this.reason = reason;
  }

  private timeLeftS(ctx: ModeContext): number {
    const elapsed = this.startTick === null ? 0 : (ctx.tick - this.startTick) / ctx.tickRate;
    return Math.max(0, this.options.timeLimitS - elapsed);
  }
}
