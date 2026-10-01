import type { ControlMode } from '../input/control-mapper.ts';

/** [keys, action] rows for the Controls panel, matching the bindings in input/control-mapper.ts and game.ts. */
export type HelpRow = readonly [keys: string, action: string];

const STICK: Record<ControlMode, readonly HelpRow[]> = {
  'mouse-aim': [
    ['Mouse', 'Aim: the jet turns toward where you point'],
    ['W S · A D · Q E', 'Pitch · roll · rudder, overriding the mouse'],
  ],
  direct: [
    ['W / S', 'Pitch (W = nose down)'],
    ['A / D', 'Roll'],
    ['Q / E', 'Rudder'],
  ],
};

const SHARED: readonly HelpRow[] = [
  ['Shift · Z · wheel', 'Throttle up · down (the top notch is afterburner)'],
  ['Space · left click', 'Cannon'],
  ['F', 'Missile, once the lock tone sounds'],
  ['G', 'Bomb (Strike, Russian jets)'],
  ['X', 'Flares'],
  ['R', 'Next target'],
  ['C · right click', 'Look around (hold)'],
  ['B', 'Airbrake (hold)'],
  ['Tab', 'Scores (hold)'],
  ['P · Esc', 'Pause'],
];

export function controlsHelp(mode: ControlMode): HelpRow[] {
  return [...STICK[mode], ...SHARED];
}
