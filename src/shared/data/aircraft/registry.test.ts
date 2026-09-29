import { describe, expect, it } from 'vitest';
import { getAircraft, listAircraft } from './registry.ts';
import { validateAircraftConfig } from './validate.ts';

describe('aircraft registry', () => {
  it('returns Kestrel by id', () => {
    expect(getAircraft('kestrel').name).toBe('Kestrel');
  });
  it('throws for unknown ids', () => {
    expect(() => getAircraft('nope')).toThrow('Unknown aircraft: nope');
  });
  it('lists by team', () => {
    expect(listAircraft('usa').map((a) => a.id)).toContain('kestrel');
    expect(listAircraft('russia').every((a) => a.team === 'russia')).toBe(true);
  });
  it('contains only valid configs with unique ids', () => {
    const all = listAircraft();
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
    for (const a of all) expect(validateAircraftConfig(a)).toEqual([]);
  });
});
