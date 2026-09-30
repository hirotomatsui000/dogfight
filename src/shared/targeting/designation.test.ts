import { describe, expect, it } from 'vitest';
import { DEG } from '../math/units.ts';
import { autoDesignate, cycleDesignation, designationOrder, isContact } from './designation.ts';
import type { Contact } from './sensors.ts';

const c = (id: number, offNoseDeg: number, rangeM: number): Contact => ({ id, visual: true, radar: true, rangeM, offNoseRad: offNoseDeg * DEG });
const contacts = [c(1, 30, 5000), c(2, 5, 9000), c(3, 30, 2000), c(4, 120, 1000)];

describe('designation', () => {
  it('orders contacts ahead by angle off the nose, then range', () => {
    expect(designationOrder(contacts).map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it('cycles through that order and wraps around', () => {
    expect(cycleDesignation(null, contacts)).toBe(2);
    expect(cycleDesignation(2, contacts)).toBe(3);
    expect(cycleDesignation(3, contacts)).toBe(1);
    expect(cycleDesignation(1, contacts)).toBe(2);
  });

  it('keeps a still-valid target when nothing is ahead', () => {
    expect(cycleDesignation(4, [c(4, 120, 1000)])).toBe(4);
    expect(cycleDesignation(7, [c(4, 120, 1000)])).toBeNull();
  });

  it('auto-designates the contact closest to the nose within 60 degrees', () => {
    expect(autoDesignate(contacts)).toBe(2);
    expect(autoDesignate([c(5, 65, 1000)])).toBeNull();
    expect(autoDesignate([])).toBeNull();
  });

  it('checks membership', () => {
    expect(isContact(3, contacts)).toBe(true);
    expect(isContact(9, contacts)).toBe(false);
    expect(isContact(null, contacts)).toBe(false);
  });
});
