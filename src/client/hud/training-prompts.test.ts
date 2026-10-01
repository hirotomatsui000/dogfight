import { describe, expect, it } from 'vitest';
import type { TrainingStatus } from '../../shared/modes/mode.ts';
import { DEFAULT_BINDINGS, rebind } from '../input/bindings.ts';
import { trainingPrompt } from './training-prompts.ts';

const status = (over: Partial<TrainingStatus>): TrainingStatus => ({
  step: 'fly',
  index: 1,
  total: 4,
  ring: null,
  ringsPassed: 0,
  ringsTotal: 3,
  droneId: null,
  attempt: 1,
  ...over,
});

describe('training prompts', () => {
  it('teaches mouse-aim flying with the ring count', () => {
    const p = trainingPrompt(status({ ringsPassed: 1 }), DEFAULT_BINDINGS, 'mouse-aim', false);
    expect(p.title).toBe('LESSON 1/4 · FLY');
    expect(p.lines.join(' ')).toMatch(/mouse/i);
    expect(p.progress).toBe('RINGS 1/3');
  });

  it('names the keys the player actually uses', () => {
    const p = trainingPrompt(status({ step: 'gun', index: 2 }), rebind(DEFAULT_BINDINGS, 'cannon', 'KeyK'), 'mouse-aim', false);
    expect(p.lines.join(' ')).toContain('hold K');
    const missile = trainingPrompt(status({ step: 'missile', index: 3 }), DEFAULT_BINDINGS, 'direct', false);
    expect(missile.lines.join(' ')).toContain('press F');
    const defend = trainingPrompt(status({ step: 'defend', index: 4 }), DEFAULT_BINDINGS, 'direct', false);
    expect(defend.lines.join(' ')).toContain('X');
    expect(defend.lines.join(' ')).toContain('TURN HARD NOW');
  });

  it('speaks to gamepad pilots in gamepad terms', () => {
    const p = trainingPrompt(status({ step: 'gun', index: 2 }), DEFAULT_BINDINGS, 'mouse-aim', true);
    expect(p.lines.join(' ')).toContain('hold X');
    expect(trainingPrompt(status({}), DEFAULT_BINDINGS, 'mouse-aim', true).lines.join(' ')).toMatch(/left stick/i);
  });

  it('encourages a retry', () => {
    expect(trainingPrompt(status({ step: 'defend', index: 4, attempt: 2 }), DEFAULT_BINDINGS, 'direct', false).title).toContain('TRY AGAIN');
  });
});
