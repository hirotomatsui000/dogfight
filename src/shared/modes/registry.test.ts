import { describe, expect, it } from 'vitest';
import type { ModeId } from './mode.ts';
import { createMode, MODE_LABELS } from './registry.ts';

describe('mode registry', () => {
  it('builds every mode by id, with its options', () => {
    for (const id of Object.keys(MODE_LABELS) as ModeId[]) expect(createMode(id).id).toBe(id);
    const tdm = createMode('team-deathmatch', { scoreLimit: 3 });
    expect((tdm as unknown as { options: { scoreLimit: number } }).options.scoreLimit).toBe(3);
    const strike = createMode('strike', { strike: { aircraftPerTeam: 8 } });
    expect((strike as unknown as { options: { aircraftPerTeam: number } }).options.aircraftPerTeam).toBe(8);
  });
});
