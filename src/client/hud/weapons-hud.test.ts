import { describe, expect, it } from 'vitest';
import { createSeeker } from '../../shared/targeting/ir-seeker.ts';
import { createRadarLock } from '../../shared/targeting/radar-lock.ts';
import { testView } from '../testing/views.ts';
import { lockDiamondPx, weaponsLine } from './weapons-hud.ts';

describe('weapons readout', () => {
  it('lists the stores and boxes the selected missile', () => {
    const v = testView(1);
    const line = weaponsLine(v, 'mrm');
    expect(line.cells.map((c) => c.text)).toEqual([`GUN ${v.stores.cannonRounds}`, `SRM ${v.stores.srm}`, `MRM ${v.stores.mrm}`, `CM ${v.stores.countermeasures}`]);
    expect(line.cells.filter((c) => c.selected).map((c) => c.text)).toEqual([`MRM ${v.stores.mrm}`]);
    expect(weaponsLine({ ...v, bombLoad: 8 }, 'srm').cells.at(-1)?.text).toBe('BMB 0');
  });

  it('shows the seeker for the Dart and the radar lock for the Lance', () => {
    const seeker = createSeeker();
    const radarLock = createRadarLock();
    const v = testView(1, { seeker, radarLock });
    seeker.mode = 'track';
    expect(weaponsLine(v, 'srm').status).toEqual({ text: 'SRM TRK', tone: 'amber' });
    radarLock.mode = 'locked';
    expect(weaponsLine(v, 'mrm').status).toEqual({ text: 'MRM LOCK', tone: 'red' });
    radarLock.mode = 'off';
    expect(weaponsLine(v, 'mrm').status.text).toBe('MRM');
    expect(weaponsLine({ ...v, stores: { ...v.stores, mrm: 0 } }, 'mrm').status.text).toBe('MRM EMPTY');
  });

  it('closes the lock diamond onto the target box as the lock builds', () => {
    expect(lockDiamondPx(13, 0)).toBeCloseTo(39, 6);
    expect(lockDiamondPx(13, 1)).toBeCloseTo(18.2, 6);
    expect(lockDiamondPx(13, 0.5)).toBeLessThan(lockDiamondPx(13, 0.2));
  });
});
