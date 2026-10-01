import { describe, expect, it } from 'vitest';
import { getAircraft } from '../data/aircraft/registry.ts';
import type { AircraftConfig } from '../data/aircraft/types.ts';
import { MRM_LANCE } from '../data/weapons.ts';
import { createRadarLock, radarLockProgress, radarLockTimeS, updateRadarLock } from './radar-lock.ts';
import type { Contact } from './sensors.ts';

const DT = 1 / 60;
const kestrel = getAircraft('kestrel');
const withSensors = (c: AircraftConfig, s: Partial<AircraftConfig['sensors']>): AircraftConfig => ({ ...c, sensors: { ...c.sensors, ...s } });
const contact = (id: number, radar = true): Contact => ({ id, visual: false, radar, rangeM: 20000, offNoseRad: 0.1 });

describe('radar lock', () => {
  it('takes 1.5 s, less with two seats or sensor fusion', () => {
    expect(radarLockTimeS(MRM_LANCE, kestrel)).toBeCloseTo(1.5, 9);
    expect(radarLockTimeS(MRM_LANCE, withSensors(kestrel, { twoSeat: true }))).toBeCloseTo(1.05, 9);
    expect(radarLockTimeS(MRM_LANCE, withSensors(kestrel, { sensorFusion: true }))).toBeCloseTo(1.2, 9);
  });

  it('builds on the designated radar contact and locks after the lock time', () => {
    const s = createRadarLock();
    const ticks = Math.round(1.5 / DT);
    for (let i = 0; i < ticks - 1; i++) updateRadarLock(s, kestrel, true, 7, [contact(7)], MRM_LANCE, DT);
    expect(s.mode).toBe('tracking');
    expect(s.targetId).toBe(7);
    expect(radarLockProgress(s, MRM_LANCE, kestrel)).toBeGreaterThan(0.95);
    updateRadarLock(s, kestrel, true, 7, [contact(7)], MRM_LANCE, DT);
    expect(s.mode).toBe('locked');
    expect(radarLockProgress(s, MRM_LANCE, kestrel)).toBe(1);
  });

  it('stays off unless the MRM is armed, and searches without a radar contact', () => {
    const s = createRadarLock();
    updateRadarLock(s, kestrel, false, 7, [contact(7)], MRM_LANCE, DT);
    expect(s.mode).toBe('off');
    updateRadarLock(s, kestrel, true, null, [contact(7)], MRM_LANCE, DT);
    expect(s.mode).toBe('search');
    // Seen only by eye, not on radar: no lock.
    updateRadarLock(s, kestrel, true, 7, [contact(7, false)], MRM_LANCE, DT);
    expect(s.mode).toBe('search');
  });

  it('drops the lock when the target leaves the radar, and starts again on a new target', () => {
    const s = createRadarLock();
    for (let i = 0; i < 120; i++) updateRadarLock(s, kestrel, true, 7, [contact(7)], MRM_LANCE, DT);
    expect(s.mode).toBe('locked');
    updateRadarLock(s, kestrel, true, 8, [contact(7), contact(8)], MRM_LANCE, DT);
    expect(s).toMatchObject({ mode: 'tracking', targetId: 8 });
    expect(s.timerS).toBeCloseTo(DT, 9);
    updateRadarLock(s, kestrel, true, 8, [contact(7)], MRM_LANCE, DT);
    expect(s).toMatchObject({ mode: 'search', targetId: null });
    updateRadarLock(s, kestrel, false, 8, [contact(8)], MRM_LANCE, DT);
    expect(s.mode).toBe('off');
  });
});
