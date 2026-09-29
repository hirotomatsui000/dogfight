import type { GameMode, ModeStatus } from './mode.ts';

/** Sightseeing and flight testing: no scoring, no combat, quick respawns. */
export class FreeFlightMode implements GameMode {
  readonly id = 'free-flight' as const;
  readonly combatEnabled = false;
  readonly respawnDelayS = 3;

  onAircraftDestroyed(): void {}

  update(): void {}

  status(): ModeStatus {
    return { modeId: this.id, label: 'Free Flight', scores: null, timeLeftS: null, winner: null };
  }
}
