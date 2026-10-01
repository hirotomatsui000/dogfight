import { type Bindings, DEFAULT_BINDINGS, type KeyAction, keyLabel } from '../input/bindings.ts';
import type { ControlMode } from '../input/control-mapper.ts';

/** [keys, action] rows for the Controls panel, built from the current key bindings. */
export type HelpRow = readonly [keys: string, action: string];

export function controlsHelp(mode: ControlMode, bindings: Bindings = DEFAULT_BINDINGS): HelpRow[] {
  const k = (a: KeyAction) => keyLabel(bindings[a][0]);
  const pair = (a: KeyAction, b: KeyAction) => `${k(a)} / ${k(b)}`;
  const stick: HelpRow[] =
    mode === 'mouse-aim'
      ? [
          ['Mouse', 'Aim: the jet turns toward where you point'],
          [`${k('pitchDown')} ${k('pitchUp')} · ${k('rollLeft')} ${k('rollRight')} · ${k('yawLeft')} ${k('yawRight')}`, 'Pitch · roll · rudder, overriding the mouse'],
        ]
      : [
          [pair('pitchDown', 'pitchUp'), `Pitch (${k('pitchDown')} = nose down)`],
          [pair('rollLeft', 'rollRight'), 'Roll'],
          [pair('yawLeft', 'yawRight'), 'Rudder'],
        ];
  return [
    ...stick,
    [`${k('throttleUp')} · ${k('throttleDown')} · wheel`, 'Throttle up · down (the top notch is afterburner)'],
    [`${k('cannon')} · left click`, 'Cannon'],
    [k('missile'), 'Missile, once the lock tone sounds'],
    [k('bomb'), 'Bomb (Strike, Russian jets)'],
    [k('flares'), 'Flares'],
    [k('nextTarget'), 'Next target'],
    [`${k('look')} · right click`, 'Look around (hold)'],
    [k('airbrake'), 'Airbrake (hold)'],
    [k('scores'), 'Scores (hold)'],
    [`${k('pause')} · Esc`, 'Pause'],
  ];
}

/** The standard gamepad layout, for the Controls panel. */
export const GAMEPAD_HELP: readonly HelpRow[] = [
  ['Left stick', 'Pitch and roll'],
  ['Right stick', 'Look around'],
  ['LB / RB', 'Rudder'],
  ['LT / RT', 'Throttle down / up'],
  ['X', 'Cannon (hold)'],
  ['A', 'Missile'],
  ['B', 'Flares'],
  ['Y', 'Next target'],
  ['D-pad ↓ / ↑', 'Bomb · airbrake (hold)'],
  ['Start · Back', 'Pause · scores (hold)'],
];
