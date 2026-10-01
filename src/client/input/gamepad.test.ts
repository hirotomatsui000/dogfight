import { describe, expect, it } from 'vitest';
import {
  applyDeadZone,
  CalibrationRecorder,
  calibrated,
  DEFAULT_PAD_SETTINGS,
  firstNewButton,
  GamepadReader,
  mostMovedAxis,
  type PadState,
} from './gamepad.ts';

const pad = (axes: number[], pressed: number[] = [], mapping = 'standard', values: Record<number, number> = {}): PadState => ({
  id: 'Test pad',
  mapping,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: values[i] ?? (pressed.includes(i) ? 1 : 0) })),
});

describe('gamepad', () => {
  it('ignores small stick movements and rescales the rest to full travel', () => {
    expect(applyDeadZone(0.05, 0.08)).toBe(0);
    expect(applyDeadZone(-1, 0.08)).toBe(-1);
    expect(applyDeadZone(0.54, 0.08)).toBeCloseTo(0.5, 5);
  });

  it('maps a standard pad: left stick flies, right stick looks, triggers move the throttle', () => {
    const r = new GamepadReader();
    const f = r.read(pad([0.5, -1, 0, 0.6], [], 'standard', { 6: 0, 7: 0.8 }), DEFAULT_PAD_SETTINGS);
    expect(f.active).toBe(true);
    expect(f.roll).toBeGreaterThan(0.4);
    expect(f.pitch).toBe(-1); // stick pushed forward: nose down
    expect(f.lookY).toBeGreaterThan(0.5);
    expect(f.throttleRate).toBeCloseTo(0.8, 5);
    expect(f.throttle).toBeNull();
  });

  it('uses the bumpers as rudder and reports button presses once', () => {
    const r = new GamepadReader();
    let f = r.read(pad([0, 0, 0, 0], [5, 0, 2]), DEFAULT_PAD_SETTINGS);
    expect(f.yaw).toBe(1);
    expect(f.down.has('cannon')).toBe(true);
    expect(f.pressed.has('missile')).toBe(true);
    f = r.read(pad([0, 0, 0, 0], [5, 0, 2]), DEFAULT_PAD_SETTINGS);
    expect(f.pressed.has('missile')).toBe(false);
    expect(f.down.has('missile')).toBe(true);
  });

  it('reads a flight stick through the custom profile and its calibration', () => {
    const settings = {
      ...DEFAULT_PAD_SETTINGS,
      calibration: [
        { center: 0.1, min: -0.8, max: 1 },
        { center: 0, min: -1, max: 1 },
        { center: 0, min: -1, max: 1 },
        { center: 0, min: -1, max: 1 },
      ],
    };
    const r = new GamepadReader();
    const f = r.read(pad([0.1, 0.5, 0, -1], [0], ''), settings);
    expect(f.roll).toBe(0);
    expect(f.pitch).toBeGreaterThan(0.4);
    expect(f.throttle).toBe(1); // slider fully forward
    expect(f.down.has('cannon')).toBe(true);
  });

  it('honors the invert flags', () => {
    const settings = { ...DEFAULT_PAD_SETTINGS, custom: { ...DEFAULT_PAD_SETTINGS.custom, invert: { roll: false, pitch: true, yaw: false, throttle: false } } };
    const f = new GamepadReader().read(pad([0, 0.5, 0, 0], [], ''), settings);
    expect(f.pitch).toBeLessThan(-0.4);
  });

  it('is inactive without a pad', () => {
    const f = new GamepadReader().read(null, DEFAULT_PAD_SETTINGS);
    expect(f.active).toBe(false);
    expect(f.pitch).toBe(0);
    expect(f.down.size).toBe(0);
  });

  it('calibrates each axis from its travel and its rest position', () => {
    const rec = new CalibrationRecorder();
    rec.sample(pad([0.02, 0.6, -0.9, 0]));
    rec.sample(pad([1, -1, 0.9, 0]));
    rec.sample(pad([-0.7, 1, 0, 0]));
    const cal = rec.finish(pad([0.05, 0, 0, 0]));
    expect(cal[0]).toEqual({ center: 0.05, min: -0.7, max: 1 });
    expect(calibrated(0.05, cal[0])).toBe(0);
    expect(calibrated(-0.7, cal[0])).toBe(-1);
    expect(calibrated(1, cal[0])).toBe(1);
    expect(calibrated(0.3, { center: 0, min: 0, max: 0 })).toBe(0);
    const lever = new CalibrationRecorder();
    lever.sample(pad([0, 0, 0, -0.9]));
    lever.sample(pad([0, 0, 0, 0.7]));
    const throttle = lever.finish(pad([0, 0, 0, 0.7]), [3])[3];
    expect(throttle.center).toBeCloseTo(-0.1, 9);
    expect([throttle.min, throttle.max]).toEqual([-0.9, 0.7]);
  });

  it('finds the button and the axis the player is moving, for assignments', () => {
    expect(firstNewButton(pad([], [1]), pad([], [1, 4]))).toBe(4);
    expect(firstNewButton(pad([], [1]), pad([], [1]))).toBe(-1);
    expect(mostMovedAxis(pad([0, 0, 0]), pad([0.1, -0.9, 0.3]), 0.5)).toBe(1);
    expect(mostMovedAxis(pad([0, 0, 0]), pad([0.1, 0.2, 0.3]), 0.5)).toBe(-1);
  });
});
