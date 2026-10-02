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
  /** the longest the pilot stayed alive in one go, seconds (career records) */
  longestLifeS: number;
}

/** The local pilot's kills and deaths in one jet (career records). */
export interface JetTally {
  kills: number;
  deaths: number;
}

const blank = (): PilotStats => ({ damage: 0, missilesFired: 0, missileHits: 0, gunHits: 0, sentinels: 0 });

/** Match statistics for the end-of-match summary (M5), built from the game events. */
export class MatchStats {
  private readonly pilots = new Map<number, PilotStats>();
  readonly flight: FlightLog = { topSpeedMs: 0, maxG: 0, airborneS: 0, distanceM: 0, longestLifeS: 0 };
  /** the local pilot's kills and deaths by the jet flown at the time */
  readonly jets = new Map<string, JetTally>();
  /** most kills without dying in between */
  bestStreak = 0;
  private streak = 0;
  private lifeS = 0;

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

  /** One frame of the local jet's flight; a frame spent dead ends the current life. */
  sampleFlight(alive: boolean, onGround: boolean, speedMs: number, gLoad: number, dt: number): void {
    if (!alive) {
      this.lifeS = 0;
      return;
    }
    if (dt <= 0) return;
    const f = this.flight;
    f.topSpeedMs = Math.max(f.topSpeedMs, speedMs);
    f.maxG = Math.max(f.maxG, gLoad);
    if (!onGround) f.airborneS += dt;
    f.distanceM += speedMs * dt;
    this.lifeS += dt;
    f.longestLifeS = Math.max(f.longestLifeS, this.lifeS);
  }

  /** The local pilot shot down an enemy while flying `aircraftId`. */
  localKill(aircraftId: string): void {
    this.tally(aircraftId).kills++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
  }

  /** The local pilot went down while flying `aircraftId`: the streak starts over. */
  localDeath(aircraftId: string): void {
    this.tally(aircraftId).deaths++;
    this.streak = 0;
  }

  reset(): void {
    this.pilots.clear();
    this.jets.clear();
    Object.assign(this.flight, { topSpeedMs: 0, maxG: 0, airborneS: 0, distanceM: 0, longestLifeS: 0 });
    this.bestStreak = 0;
    this.streak = 0;
    this.lifeS = 0;
  }

  private tally(aircraftId: string): JetTally {
    let t = this.jets.get(aircraftId);
    if (!t) {
      t = { kills: 0, deaths: 0 };
      this.jets.set(aircraftId, t);
    }
    return t;
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
