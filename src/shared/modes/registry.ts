import { AirSuperiorityMode } from './air-superiority.ts';
import { FreeFlightMode } from './free-flight.ts';
import type { GameMode, ModeId } from './mode.ts';
import { StrikeMode, type StrikeOptions } from './strike.ts';
import { TeamDeathmatchMode } from './team-deathmatch.ts';
import { TeamObjectiveMode } from './team-objective.ts';
import { TrainingMode } from './training.ts';

export interface ModeOptions {
  /** Strike: aircraft per team */
  strike?: Partial<StrikeOptions>;
  /** a lower score limit for the scoring modes (tests) */
  scoreLimit?: number;
}

/** A fresh mode by id for the World. */
export function createMode(id: ModeId, options: ModeOptions = {}): GameMode {
  const limit = options.scoreLimit === undefined ? {} : { scoreLimit: options.scoreLimit };
  switch (id) {
    case 'team-deathmatch':
      return new TeamDeathmatchMode(limit);
    case 'air-superiority':
      return new AirSuperiorityMode(limit);
    case 'team-objective':
      return new TeamObjectiveMode(limit);
    case 'free-flight':
      return new FreeFlightMode();
    case 'strike':
      return new StrikeMode(options.strike);
    case 'training':
      return new TrainingMode();
  }
}
