import type { TeamId } from '../data/aircraft/types.ts';
import type { GroundTargetSpec, MapDefinition, SpawnSpec } from '../data/maps/map-definition.ts';
import { clamp } from '../math/units.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { BotGoal, GameMode, ModeContext, ModeStatus, ZoneSpec, ZoneStatus } from './mode.ts';

export interface AirSuperiorityOptions {
  scoreLimit: number;
  timeLimitS: number;
}

/** Spec §13: first to 300, or the most after 12 minutes. */
export const AIR_SUPERIORITY_DEFAULTS: AirSuperiorityOptions = { scoreLimit: 300, timeLimitS: 720 };
export const ZONE_RADIUS_M = 4000;
export const ZONE_FLOOR_M = 1000;
export const ZONE_CEILING_M = 7000;
/** With one more aircraft inside, a neutral zone is captured in this long. */
export const CAPTURE_S = 10;
/** Each owned zone scores a point this often. */
export const ZONE_POINT_INTERVAL_S = 2;
/** Zones lie this share of the combat radius apart along the front, at most 20 km. */
const ZONE_SPACING_SHARE = 0.4;
const MAX_ZONE_SPACING_M = 20000;
/** Bots circle in the middle of the band, well inside the zone. */
const BOT_ALTITUDE_M = 4000;
const BOT_CIRCLE_SHARE = 0.55;

/**
 * Three zones on the front (spec §13): the line halfway between the two spawns, square to the line joining them. Zone
 * B sits on that line between the spawns, A and C either side of it.
 */
export function frontZones(map: MapDefinition): ZoneSpec[] {
  const u = map.spawns.usa;
  const r = map.spawns.russia;
  const mx = (u.x + r.x) / 2;
  const mz = (u.z + r.z) / 2;
  const len = Math.max(1, Math.hypot(r.x - u.x, r.z - u.z));
  // Square to the line between the spawns.
  const px = -(r.z - u.z) / len;
  const pz = (r.x - u.x) / len;
  const spacing = Math.min(MAX_ZONE_SPACING_M, ZONE_SPACING_SHARE * map.combatArea.radiusM);
  return ['A', 'B', 'C'].map((id, i) => ({
    id,
    x: mx + px * spacing * (i - 1),
    z: mz + pz * spacing * (i - 1),
    radiusM: ZONE_RADIUS_M,
    floorM: ZONE_FLOOR_M,
    ceilingM: ZONE_CEILING_M,
  }));
}

export function insideZone(zone: ZoneSpec, x: number, y: number, z: number): boolean {
  return y >= zone.floorM && y <= zone.ceilingM && (x - zone.x) ** 2 + (z - zone.z) ** 2 <= zone.radiusM ** 2;
}

/**
 * Moves a zone's progress toward the side with more aircraft inside (rate ∝ advantage) and settles its owner: a side
 * owns it at its end of the scale, and loses it when the other side pushes progress back past the middle. Returns the
 * owner change, if any.
 */
export function stepZone(zone: ZoneStatus, dtS: number): { owner: TeamId | null; previous: TeamId | null } | null {
  const advantage = zone.inside.usa - zone.inside.russia;
  if (advantage === 0) return null;
  zone.progress = clamp(zone.progress + (advantage * dtS) / CAPTURE_S, -1, 1);
  const previous = zone.owner;
  if ((previous === 'usa' && zone.progress <= 0) || (previous === 'russia' && zone.progress >= 0)) zone.owner = null;
  if (zone.progress >= 1) zone.owner = 'usa';
  else if (zone.progress <= -1) zone.owner = 'russia';
  return zone.owner === previous ? null : { owner: zone.owner, previous };
}

/**
 * Air Superiority (spec §13, M5): three capture zones along the front. Each zone a team owns scores a point every
 * 2 s; kills score nothing. First to 300, or the higher score after 12 minutes.
 */
export class AirSuperiorityMode implements GameMode {
  readonly id = 'air-superiority' as const;
  readonly combatEnabled = true;
  readonly runwayStarts: boolean = true;
  readonly respawnDelayS = 5;
  readonly options: AirSuperiorityOptions;
  private readonly scores: Record<TeamId, number> = { usa: 0, russia: 0 };
  private zones: ZoneStatus[] | null = null;
  private winner: TeamId | 'draw' | null = null;
  private startTick: number | null = null;

  constructor(options: Partial<AirSuperiorityOptions> = {}) {
    this.options = { ...AIR_SUPERIORITY_DEFAULTS, ...options };
  }

  prepare(map: MapDefinition): void {
    if (!this.zones) this.zones = frontZones(map).map((z) => ({ ...z, progress: 0, owner: null, inside: { usa: 0, russia: 0 } }));
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

  canRespawn(): boolean {
    return true;
  }

  onAircraftDestroyed(): void {}

  update(ctx: ModeContext): void {
    if (this.startTick === null) this.startTick = ctx.tick;
    const zones = this.zones;
    if (!zones || this.winner) return;
    for (const zone of zones) {
      zone.inside.usa = 0;
      zone.inside.russia = 0;
    }
    for (const a of ctx.aircraftList()) {
      if (!a.alive || a.support) continue;
      const p = a.flight.pos;
      for (const zone of zones) if (insideZone(zone, p.x, p.y, p.z)) zone.inside[a.team]++;
    }
    for (const zone of zones) {
      const change = stepZone(zone, 1 / ctx.tickRate);
      if (change) ctx.emit?.({ type: 'zone', zoneId: zone.id, owner: change.owner, previous: change.previous });
    }
    const elapsedTicks = ctx.tick - this.startTick;
    const interval = Math.round(ZONE_POINT_INTERVAL_S * ctx.tickRate);
    if (elapsedTicks > 0 && elapsedTicks % interval === 0) {
      for (const zone of zones) if (zone.owner) this.scores[zone.owner]++;
    }
    const { usa, russia } = this.scores;
    const limit = this.options.scoreLimit;
    if (usa >= limit || russia >= limit || this.timeLeftS(ctx) <= 0) {
      this.winner = usa === russia ? 'draw' : usa > russia ? 'usa' : 'russia';
    }
  }

  status(ctx: ModeContext): ModeStatus {
    return {
      modeId: this.id,
      label: 'Air Superiority',
      scores: { ...this.scores },
      timeLeftS: this.timeLeftS(ctx),
      winner: this.winner,
      // Progress in hundredths: enough for the bars, and the online status only changes when it moves visibly.
      zones: (this.zones ?? []).map((z) => ({ ...z, progress: Math.round(z.progress * 100) / 100, inside: { ...z.inside } })),
    };
  }

  /**
   * A bot takes a zone its side does not own, or else holds one the enemy is in; bots spread over the candidates by id,
   * so a team covers more than one zone.
   */
  botGoal(_ctx: ModeContext, bot: AircraftEntity): BotGoal | null {
    const zones = this.zones;
    if (!zones || zones.length === 0) return null;
    const enemy = bot.team === 'usa' ? 'russia' : 'usa';
    let candidates = zones.filter((z) => z.owner !== bot.team);
    if (candidates.length === 0) candidates = zones.filter((z) => z.inside[enemy] > 0);
    if (candidates.length === 0) candidates = zones;
    const zone = candidates[bot.id % candidates.length];
    return { x: zone.x, z: zone.z, altitudeM: BOT_ALTITUDE_M, radiusM: zone.radiusM * BOT_CIRCLE_SHARE };
  }

  private timeLeftS(ctx: ModeContext): number {
    const elapsed = this.startTick === null ? 0 : (ctx.tick - this.startTick) / ctx.tickRate;
    return Math.max(0, this.options.timeLimitS - elapsed);
  }
}
