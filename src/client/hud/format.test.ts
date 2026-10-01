import { describe, expect, it } from 'vitest';
import {
  altitudeLabel,
  altitudeValue,
  formatClock,
  formatTimeOfDay,
  formatClosure,
  formatMach,
  formatRange,
  headingDegrees,
  headingLabel,
  speedLabel,
  speedValue,
  verticalSpeedValue,
} from './format.ts';

describe('HUD formatting', () => {
  it('converts speed by unit system', () => {
    expect(speedValue(100, 'imperial')).toBeCloseTo(194.38, 1);
    expect(speedValue(100, 'metric')).toBeCloseTo(360, 6);
    expect(speedLabel('imperial')).toBe('KT');
    expect(speedLabel('metric')).toBe('KM/H');
  });
  it('converts altitude and vertical speed', () => {
    expect(altitudeValue(1000, 'imperial')).toBeCloseTo(3280.8, 1);
    expect(altitudeValue(1000, 'metric')).toBe(1000);
    expect(altitudeLabel('imperial')).toBe('FT');
    expect(verticalSpeedValue(10, 'imperial')).toBeCloseTo(1968.5, 1);
    expect(verticalSpeedValue(10, 'metric')).toBe(10);
  });
  it('formats headings', () => {
    expect(headingDegrees(0)).toBe(0);
    expect(headingDegrees(-Math.PI / 2)).toBe(270);
    expect(headingDegrees(2 * Math.PI - 0.001)).toBe(0);
    expect(headingLabel(0)).toBe('N');
    expect(headingLabel(90)).toBe('E');
    expect(headingLabel(360)).toBe('N');
    expect(headingLabel(30)).toBe('030');
    expect(headingLabel(-10)).toBe('350');
  });
  it('formats Mach and clocks', () => {
    expect(formatMach(0.853)).toBe('M 0.85');
    expect(formatClock(125.4)).toBe('2:05');
  });
  it('formats ranges and closure by unit system', () => {
    expect(formatRange(2400, 'metric')).toBe('2.4 KM');
    expect(formatRange(24000, 'metric')).toBe('24 KM');
    expect(formatRange(1852 * 3.25, 'imperial')).toBe('3.3 NM');
    expect(formatClosure(100, 'metric')).toBe('+360 KM/H');
    expect(formatClosure(-50, 'imperial')).toBe('-97 KT');
  });
});

describe('time of day (M4)', () => {
  it('reads like a 24-hour clock', () => {
    expect(formatTimeOfDay(6.5)).toBe('06:30');
    expect(formatTimeOfDay(23.999)).toBe('23:59');
    expect(formatTimeOfDay(24.25)).toBe('00:15');
  });
});
