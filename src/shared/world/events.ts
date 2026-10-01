export type DeathCause = 'crash' | 'collision' | 'boundary' | 'cannon' | 'missile';
export type WeaponKind = 'cannon' | 'missile';

export type GameEvent =
  | { type: 'spawned'; aircraftId: number; spawnGen: number }
  | { type: 'destroyed'; aircraftId: number; cause: DeathCause; killerId: number | null }
  | { type: 'hit'; aircraftId: number; attackerId: number | null; weapon: WeaponKind; damage: number }
  | { type: 'missileLaunched'; missileId: number; shooterId: number; targetId: number }
  | { type: 'missileDetonated'; missileId: number; x: number; y: number; z: number; nearAircraft: boolean }
  | { type: 'missileDecoyed'; missileId: number; targetId: number }
  | { type: 'countermeasures'; aircraftId: number }
  | { type: 'bombReleased'; bombId: number; aircraftId: number }
  | { type: 'bombImpact'; bombId: number; x: number; y: number; z: number }
  | { type: 'targetHit'; targetId: string; attackerId: number | null; damage: number }
  | { type: 'targetDestroyed'; targetId: string; attackerId: number | null };
