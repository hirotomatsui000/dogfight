import { describe, expect, it } from 'vitest';
import type { ModeId } from './mode.ts';
import { createMode } from './registry.ts';

describe('mode registry', () => {
  it('builds every mode by id, with its options', () => {
    const ids: ModeId[] = ['team-deathmatch', 'air-superiority', 'team-objective', 'free-flight', 'strike', 'training'];
    for (const id of ids) expect(createMode(id).id).toBe(id);
    const tdm = createMode('team-deathmatch', { scoreLimit: 3 });
    expect((tdm as unknown as { options: { scoreLimit: number } }).options.scoreLimit).toBe(3);
    const strike = createMode('strike', { strike: { aircraftPerTeam: 8 } });
    expect((strike as unknown as { options: { aircraftPerTeam: number } }).options.aircraftPerTeam).toBe(8);
  });
});
