import type { GameEvent } from '../shared/world/events.ts';

/** What one pilot did in a match, from the game events (M5). */
export interface PilotStats {
  damage: number;
  missilesFired: number;
  missileHits: number;
  gunHits: number;
  /** enemy Sentinels shot down */
  sentinels: number;
}

/** The local pilot's own flying (M5). */
export interface FlightLog {
  topSpeedMs: number;
  maxG: number;
  /** seconds in the air */
  airborneS: number;
  distanceM: number;
}

const blank = (): PilotStats => ({ damage: 0, missilesFired: 0, missileHits: 0, gunHits: 0, sentinels: 0 });

/**
 * Match statistics for the end-of-match summary (M5). Built from the same events every client receives, so it works
 * offline and online alike, without the server keeping score of anything new.
 */
export class MatchStats {
  private readonly pilots = new Map<number, PilotStats>();
  readonly flight: FlightLog = { topSpeedMs: 0, maxG: 0, airborneS: 0, distanceM: 0 };

  of(id: number): PilotStats {
    return this.pilots.get(id) ?? blank();
  }

  /** `isSupport` tells a Sentinel from a fighter by aircraft id. */
  onEvent(e: GameEvent, isSupport: (id: number) => boolean): void {
    if (e.type === 'hit' && e.attackerId !== null) {
      const s = this.edit(e.attackerId);
      s.damage += e.damage;
      if (e.weapon === 'cannon') s.gunHits++;
      else s.missileHits++;
    } else if (e.type === 'missileLaunched') {
      this.edit(e.shooterId).missilesFired++;
    } else if (e.type === 'destroyed' && e.killerId !== null && isSupport(e.aircraftId)) {
      this.edit(e.killerId).sentinels++;
    }
  }

  /** One frame of the local jet's flight. */
  sampleFlight(alive: boolean, onGround: boolean, speedMs: number, gLoad: number, dt: number): void {
    if (!alive || dt <= 0) return;
    const f = this.flight;
    f.topSpeedMs = Math.max(f.topSpeedMs, speedMs);
    f.maxG = Math.max(f.maxG, gLoad);
    if (!onGround) f.airborneS += dt;
    f.distanceM += speedMs * dt;
  }

  reset(): void {
    this.pilots.clear();
    Object.assign(this.flight, { topSpeedMs: 0, maxG: 0, airborneS: 0, distanceM: 0 });
  }

  private edit(id: number): PilotStats {
    let s = this.pilots.get(id);
    if (!s) {
      s = blank();
      this.pilots.set(id, s);
    }
    return s;
  }
}
