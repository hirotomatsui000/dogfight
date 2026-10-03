import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEG } from '../math/units.ts';
import { assistedAim, GUN_ASSIST_RANGE_M, gunAssistPull } from './gun-assist.ts';

const nose = new Vector3(0, 0, -1);
/** A firing solution `deg` to the right of the nose. */
const off = (deg: number) => new Vector3(Math.sin(deg * DEG), 0, -Math.cos(deg * DEG));

describe('gun aim assist', () => {
  it('pulls fully within 3° of the nose, fades out by 6° and stops beyond gun range', () => {
    expect(gunAssistPull(nose, off(1), 500)).toBe(1);
    expect(gunAssistPull(nose, off(3), 500)).toBeCloseTo(1);
    expect(gunAssistPull(nose, off(4.5), 500)).toBeCloseTo(0.5);
    expect(gunAssistPull(nose, off(6), 500)).toBeCloseTo(0);
    expect(gunAssistPull(nose, off(10), 500)).toBe(0);
    expect(gunAssistPull(nose, off(1), GUN_ASSIST_RANGE_M + 1)).toBe(0);
  });

  it('turns the rounds from the nose onto the solution by the pull', () => {
    const lead = off(4);
    expect(assistedAim(nose, lead, 1, new Vector3()).angleTo(lead)).toBeCloseTo(0);
    expect(assistedAim(nose, lead, 0, new Vector3()).angleTo(nose)).toBeCloseTo(0);
    const half = assistedAim(nose, lead, 0.5, new Vector3());
    expect(half.length()).toBeCloseTo(1);
    expect(half.angleTo(nose) / DEG).toBeCloseTo(2, 1);
  });
});
