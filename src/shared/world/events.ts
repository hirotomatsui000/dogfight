export type DeathCause = 'crash' | 'collision' | 'boundary' | 'cannon' | 'missile';

export type GameEvent =
  | { type: 'spawned'; aircraftId: number; spawnGen: number }
  | { type: 'destroyed'; aircraftId: number; cause: DeathCause; killerId: number | null };
