import { opposingTeam, sentinelFor } from '../data/aircraft/registry.ts';
import type { TeamId } from '../data/aircraft/types.ts';
import type { GroundTargetSpec, MapDefinition, SpawnSpec } from '../data/maps/map-definition.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { BotGoal, GameMode, ModeContext, ModeStatus, SentinelStatus, SupportSpec } from './mode.ts';

export interface TeamObjectiveOptions {
  scoreLimit: number;
  timeLimitS: number;
  /** fighters on each side, players and bots, which set how sturdy the USA's Sentinels are */
  fighters: Record<TeamId, number>;
}

/** Spec §13: first to 60, or the most after 15 minutes. */
export const TEAM_OBJECTIVE_DEFAULTS: TeamObjectiveOptions = { scoreLimit: 60, timeLimitS: 900, fighters: { usa: 3, russia: 3 } };
export const SENTINEL_POINTS = 20;
export const DATALINK_DOWN_S = 60;
export const SENTINEL_RETURN_S = 120;
export const SENTINEL_ALTITUDE_M = 7000;
export const SENTINEL_SPEED_MS = 150;
/**
 * Every fighter carries this many Lances here (revision 19). Lances wear the big, slow Sentinels down, so the jets'
 * own loads (Russia's average 4.5 against the USA's 3.5) won about 70% of 3 v 3 bot matches for Russia; with one load
 * the sides are even.
 */
export const TEAM_OBJECTIVE_LANCES = 4;
/**
 * Russia's fighters, tougher, with more flares and 30 mm guns, shoot Sentinels down faster than the USA's, and the
 * more of them hunt, the more it tells: with 400 HP on both sides Russia won about 75% of 3 v 3 bot matches. So the
 * USA's Sentinels get this many extra hit points per Russian fighter (revision 19): 450 in 1 v 1, 550 in 3 v 3, 600 in
 * 4 v 4. Bot play then gave the USA 40–48% of the decided matches at every size from 1 v 1 to 4 v 4.
 */
export const USA_SENTINEL_HP_PER_ENEMY = 50;

/** A Sentinel's hit points in a match with `russianFighters` fighters on the Russian side. */
export function sentinelHitPoints(team: TeamId, russianFighters: number): number {
  const base = sentinelFor(team).damage.hitPoints;
  return team === 'usa' ? base + USA_SENTINEL_HP_PER_ENEMY * Math.max(0, russianFighters) : base;
}
/** Sentinels orbit this share of the combat radius behind the front, either side of the team's axis. */
const BEHIND_SHARE = 0.6;
const ASIDE_SHARE = 0.25;
const ORBIT_SHARE = 0.15;
const MAX_ORBIT_M = 8000;
/** One bot in three escorts its own Sentinels; the others hunt the enemy's. */
const ESCORT_EVERY = 3;
const ESCORT_RADIUS_M = 6000;
const ATTACK_RADIUS_M = 2000;

/**
 * Where a team's two Sentinels orbit (spec §13: "behind its lines"): on the far side of the team's spawn from the
 * front, 0.6 × the combat radius from the middle, a quarter radius either side of the team's axis.
 */
export function sentinelOrbits(map: MapDefinition, team: TeamId): SupportSpec['orbit'][] {
  const own = map.spawns[team];
  const other = map.spawns[opposingTeam(team)];
  const mx = (own.x + other.x) / 2;
  const mz = (own.z + other.z) / 2;
  const len = Math.max(1, Math.hypot(own.x - other.x, own.z - other.z));
  // From the front toward this team's side, and square to it.
  const bx = (own.x - other.x) / len;
  const bz = (own.z - other.z) / len;
  const R = map.combatArea.radiusM;
  const radiusM = Math.min(MAX_ORBIT_M, ORBIT_SHARE * R);
  return [-1, 1].map((side) => ({
    x: mx + bx * BEHIND_SHARE * R - bz * side * ASIDE_SHARE * R,
    z: mz + bz * BEHIND_SHARE * R + bx * side * ASIDE_SHARE * R,
    radiusM,
    altitudeM: SENTINEL_ALTITUDE_M,
    speedMs: SENTINEL_SPEED_MS,
  }));
}

/**
 * Team Objective (spec §13, M5): each team guards two AI-flown Sentinel radar aircraft. A Sentinel shot down gives the
 * other team 20 points and takes its own team's datalink down for 60 s; it returns after 120 s. Every death of a fighter
 * gives the other team a point. First to 60, or the higher score after 15 minutes.
 */
export class TeamObjectiveMode implements GameMode {
  readonly id = 'team-objective' as const;
  readonly combatEnabled = true;
  readonly runwayStarts: boolean = true;
  readonly respawnDelayS = 5;
  readonly options: TeamObjectiveOptions;
  private readonly scores: Record<TeamId, number> = { usa: 0, russia: 0 };
  private readonly destroyed: Record<TeamId, number> = { usa: 0, russia: 0 };
  /** the tick each team's datalink comes back */
  private readonly linkBackTick: Record<TeamId, number> = { usa: 0, russia: 0 };
  private winner: TeamId | 'draw' | null = null;
  private startTick: number | null = null;
  private tick = 0;

  constructor(options: Partial<TeamObjectiveOptions> = {}) {
    this.options = { ...TEAM_OBJECTIVE_DEFAULTS, ...options };
  }

  spawnPoint(map: MapDefinition, team: TeamId): SpawnSpec {
    return map.spawns[team];
  }

  groundTargets(): readonly GroundTargetSpec[] {
    return [];
  }

  bombLoad(): number {
    return 0;
  }

  lanceLoad(): number {
    return TEAM_OBJECTIVE_LANCES;
  }

  canRespawn(): boolean {
    return true;
  }

  supportAircraft(map: MapDefinition): readonly SupportSpec[] {
    const out: SupportSpec[] = [];
    for (const team of ['usa', 'russia'] as const) {
      sentinelOrbits(map, team).forEach((orbit, i) => {
        out.push({
          team,
          aircraftId: sentinelFor(team).id,
          callsign: `Sentinel ${i + 1}`,
          orbit,
          respawnDelayS: SENTINEL_RETURN_S,
          hitPoints: sentinelHitPoints(team, this.options.fighters.russia),
        });
      });
    }
    return out;
  }

  datalinkUp(team: TeamId): boolean {
    return this.tick >= this.linkBackTick[team];
  }

  onAircraftDestroyed(ctx: ModeContext, victim: AircraftEntity): void {
    if (this.winner) return;
    const other = opposingTeam(victim.team);
    if (victim.support) {
      this.scores[other] += SENTINEL_POINTS;
      this.destroyed[other]++;
      this.linkBackTick[victim.team] = ctx.tick + Math.round(DATALINK_DOWN_S * ctx.tickRate);
    } else {
      this.scores[other]++;
    }
    if (this.scores[other] >= this.options.scoreLimit) this.winner = other;
  }

  update(ctx: ModeContext): void {
    this.tick = ctx.tick;
    if (this.startTick === null) this.startTick = ctx.tick;
    if (this.winner || this.timeLeftS(ctx) > 0) return;
    const { usa, russia } = this.scores;
    this.winner = usa === russia ? 'draw' : usa > russia ? 'usa' : 'russia';
  }

  status(ctx: ModeContext): ModeStatus {
    const sentinels: SentinelStatus[] = [];
    for (const a of ctx.aircraftList()) {
      if (!a.support) continue;
      sentinels.push({ id: a.id, team: a.team, alive: a.alive, returnInS: a.alive ? null : Math.max(0, Math.ceil((a.respawnAtTick - ctx.tick) / ctx.tickRate)) });
    }
    const down = (team: TeamId) => Math.max(0, Math.ceil((this.linkBackTick[team] - ctx.tick) / ctx.tickRate));
    return {
      modeId: this.id,
      label: 'Team Objective',
      scores: { ...this.scores },
      timeLeftS: this.timeLeftS(ctx),
      winner: this.winner,
      objective: { sentinels, datalinkDownS: { usa: down('usa'), russia: down('russia') }, sentinelsDestroyed: { ...this.destroyed } },
    };
  }

  /**
   * Most bots hunt the nearest enemy Sentinel in the air; one in three escorts its own team's nearest one. With no
   * Sentinel of the right side flying, a bot patrols.
   */
  botGoal(ctx: ModeContext, bot: AircraftEntity): BotGoal | null {
    // Every third fighter of a team, counted among its own fighters (revision 19): counting aircraft ids gave the sides
    // different numbers of escorts, and a lone 1 v 1 fighter escorted instead of hunting.
    let place = 0;
    for (const a of ctx.aircraftList()) if (a.team === bot.team && !a.support && a.spawnSlot < bot.spawnSlot) place++;
    const escort = place % ESCORT_EVERY === ESCORT_EVERY - 1;
    const wanted = escort ? bot.team : opposingTeam(bot.team);
    let best: AircraftEntity | null = null;
    let bestD = Infinity;
    for (const a of ctx.aircraftList()) {
      if (!a.support || !a.alive || a.team !== wanted) continue;
      const d = Math.hypot(a.flight.pos.x - bot.flight.pos.x, a.flight.pos.z - bot.flight.pos.z);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (!best) return null;
    const p = best.flight.pos;
    return { x: p.x, z: p.z, altitudeM: p.y, radiusM: escort ? ESCORT_RADIUS_M : ATTACK_RADIUS_M };
  }

  private timeLeftS(ctx: ModeContext): number {
    const elapsed = this.startTick === null ? 0 : (ctx.tick - this.startTick) / ctx.tickRate;
    return Math.max(0, this.options.timeLimitS - elapsed);
  }
}
