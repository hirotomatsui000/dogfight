import type { TrainingStatus, TrainingStepId } from '../../shared/modes/mode.ts';
import { type Bindings, type KeyAction, keyLabel } from '../input/bindings.ts';
import type { ControlMode } from '../input/control-mapper.ts';

export interface TrainingPrompt {
  title: string;
  lines: string[];
  /** e.g. "RINGS 1/3" */
  progress: string | null;
}

const STEP_NAMES: Readonly<Record<TrainingStepId, string>> = { fly: 'FLY', gun: 'GUN', missile: 'MISSILE', defend: 'DEFEND', done: 'DONE' };

/** What the training panel says for this lesson, with the keys (or pad buttons) the player really uses. */
export function trainingPrompt(s: TrainingStatus, bindings: Bindings, mode: ControlMode, gamepad: boolean): TrainingPrompt {
  const key = (a: KeyAction) => keyLabel(bindings[a][0]);
  const retry = s.attempt > 1 && s.step !== 'fly' ? ' · TRY AGAIN' : '';
  const title = s.step === 'done' ? 'TRAINING COMPLETE' : `LESSON ${s.index}/${s.total} · ${STEP_NAMES[s.step]}${retry}`;
  const fire = gamepad ? 'X' : key('cannon');
  const missile = gamepad ? 'A' : key('missile');
  const flares = gamepad ? 'B' : key('flares');
  const throttle = gamepad ? 'RT' : key('throttleUp');
  switch (s.step) {
    case 'fly':
      return {
        title,
        lines: [
          gamepad
            ? 'Steer with the left stick: push to dive, pull to climb, sideways to roll and turn.'
            : mode === 'mouse-aim'
              ? 'Point the mouse at the ring: the jet turns to follow the white circle.'
              : `Fly with ${key('pitchDown')} ${key('pitchUp')} (nose down / up) and ${key('rollLeft')} ${key('rollRight')} (roll), then pull to turn.`,
          `Fly through the green rings. Hold ${throttle} for more speed.`,
        ],
        progress: `RINGS ${s.ringsPassed}/${s.ringsTotal}`,
      };
    case 'gun':
      return {
        title,
        lines: ['A target drone is ahead (the red box). Close in behind it.', `Inside 2 km a gun circle appears: put your nose on it and hold ${fire}.`],
        progress: null,
      };
    case 'missile':
      return {
        title,
        lines: ['Keep the drone in front of you until the tone turns steady: SRM LOCK.', `Then press ${missile} to fire a missile.`],
        progress: null,
      };
    case 'defend':
      return {
        title,
        lines: [`A missile is coming at you. Press ${flares} for flares,`, 'then turn hard when TURN HARD NOW flashes.'],
        progress: null,
      };
    case 'done':
      return { title, lines: ['You can fly, shoot and survive a missile.'], progress: null };
  }
}
