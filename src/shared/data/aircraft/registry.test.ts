import { describe, expect, it } from 'vitest';
import { getAircraft, listAircraft, opposingTeam } from './registry.ts';
import { validateAircraftConfig } from './validate.ts';

describe('aircraft registry', () => {
  it('returns Kestrel and Kobchik by id', () => {
    expect(getAircraft('kestrel').name).toBe('Kestrel');
    expect(getAircraft('kobchik').name).toBe('Kobchik');
  });
  it('throws for unknown ids', () => {
    expect(() => getAircraft('nope')).toThrow('Unknown aircraft: nope');
  });
  it('lists by team, with at least one aircraft per team', () => {
    expect(listAircraft('usa').map((a) => a.id)).toContain('kestrel');
    expect(listAircraft('russia').map((a) => a.id)).toContain('kobchik');
    expect(listAircraft('russia').every((a) => a.team === 'russia')).toBe(true);
  });
  it('contains only valid configs with unique ids', () => {
    const all = listAircraft();
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
    for (const a of all) expect(validateAircraftConfig(a)).toEqual([]);
  });
  it('names the opposing team', () => {
    expect(opposingTeam('usa')).toBe('russia');
    expect(opposingTeam('russia')).toBe('usa');
  });
});
