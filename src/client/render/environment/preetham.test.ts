import { describe, expect, it } from 'vitest';
import { horizonColor, skyRadiance } from './preetham.ts';

const params = { turbidity: 3, rayleigh: 1.5, mieCoefficient: 0.005, mieDirectionalG: 0.8 };
const unit = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

describe('Preetham sky colour (M4)', () => {
  it('is blue overhead at noon, brighter toward the sun', () => {
    const noon = unit(0, 0.62, 0.78);
    const [r, g, b] = skyRadiance(unit(0, 1, -0.3), noon, params);
    expect(b).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(r);
    const nearSun = skyRadiance(unit(0, 0.6, 0.8), noon, params);
    expect(nearSun[0] + nearSun[1] + nearSun[2]).toBeGreaterThan(r + g + b);
  });

  it('turns the horizon warm at sunset and nearly black at night', () => {
    const sunset = horizonColor(unit(-1, 0.02, 0), params);
    const noon = horizonColor(unit(0, 0.62, 0.78), params);
    expect(sunset[0] / sunset[2]).toBeGreaterThan(noon[0] / noon[2]);
    const night = horizonColor(unit(0, -0.6, 0.8), params);
    expect(night[0] + night[1] + night[2]).toBeLessThan(0.05 * (noon[0] + noon[1] + noon[2]));
    for (const c of [...sunset, ...noon, ...night]) expect(Number.isFinite(c)).toBe(true);
  });
});
