import type { TeamId } from '../data/aircraft/types.ts';
import type { GroundTargetSpec, MapDefinition, SpawnSpec } from '../data/maps/map-definition.ts';
import type { GameMode, ModeStatus } from './mode.ts';

/** Sightseeing and flight testing: no scoring, no combat, quick respawns. */
export class FreeFlightMode implements GameMode {
  readonly id = 'free-flight' as const;
  readonly combatEnabled = false;
  readonly respawnDelayS = 3;

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

  update(): void {}

  status(): ModeStatus {
    return { modeId: this.id, label: 'Free Flight', scores: null, timeLeftS: null, winner: null };
  }
}
