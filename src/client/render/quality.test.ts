import { describe, expect, it } from 'vitest';
import { initialAutoLevel, QualityGovernor, resolveQuality, SLOW_WINDOW_S, WARMUP_S } from './quality.ts';

const run = (g: QualityGovernor, fps: number, seconds: number) => {
  const changes = [];
  for (let t = 0; t < seconds; t += 1 / fps) {
    const c = g.frame(1 / fps);
    if (c) changes.push(c);
  }
  return changes;
};

describe('graphics quality', () => {
  it('starts Auto on High, or Medium on a very large screen', () => {
    expect(initialAutoLevel(1440, 900, 2)).toBe('high');
    expect(initialAutoLevel(1920, 1080, 1)).toBe('high');
    expect(initialAutoLevel(2560, 1440, 2)).toBe('medium');
  });

  it('uses the chosen level, or what Auto settled on before', () => {
    expect(resolveQuality('low', 'high', 1440, 900, 2)).toBe('low');
    expect(resolveQuality('auto', 'medium', 1440, 900, 2)).toBe('medium');
    expect(resolveQuality('auto', null, 1440, 900, 2)).toBe('high');
  });

  it('keeps the level while the frame rate is fine', () => {
    const g = new QualityGovernor('high');
    expect(run(g, 60, 30)).toEqual([]);
    expect(g.level).toBe('high');
  });

  it('ignores the warm-up, then steps down one level per slow window', () => {
    const g = new QualityGovernor('high');
    expect(run(g, 30, WARMUP_S - 0.5)).toEqual([]);
    expect(run(g, 30, 0.5 + SLOW_WINDOW_S + 0.1)).toEqual(['medium']);
    expect(run(g, 30, WARMUP_S + SLOW_WINDOW_S + 0.2)).toEqual(['low']);
    expect(run(g, 10, 30)).toEqual([]);
    expect(g.level).toBe('low');
  });

  it('ignores stalls such as a hidden tab', () => {
    const g = new QualityGovernor('high');
    expect(g.frame(5)).toBeNull();
    expect(g.frame(Number.NaN)).toBeNull();
    expect(run(g, 60, 10)).toEqual([]);
  });
});
