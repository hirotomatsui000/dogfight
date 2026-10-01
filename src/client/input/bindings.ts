/** Keyboard actions the player can rebind (spec §15.3, M1c). Mouse buttons and Esc (pause) are fixed. */
export const BINDABLE_ACTIONS = [
  'pitchDown',
  'pitchUp',
  'rollLeft',
  'rollRight',
  'yawLeft',
  'yawRight',
  'throttleUp',
  'throttleDown',
  'cannon',
  'missile',
  'bomb',
  'flares',
  'nextTarget',
  'airbrake',
  'look',
  'scores',
  'map',
  'pause',
  'weaponSrm',
  'weaponMrm',
] as const;

export type KeyAction = (typeof BINDABLE_ACTIONS)[number];

/** KeyboardEvent.code values per action; the first is the primary key that rebinding replaces. */
export type Bindings = Readonly<Record<KeyAction, readonly string[]>>;

export const DEFAULT_BINDINGS: Bindings = {
  pitchDown: ['KeyW', 'ArrowUp'],
  pitchUp: ['KeyS', 'ArrowDown'],
  rollLeft: ['KeyA', 'ArrowLeft'],
  rollRight: ['KeyD', 'ArrowRight'],
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  throttleUp: ['ShiftLeft', 'ShiftRight'],
  throttleDown: ['KeyZ'],
  cannon: ['Space'],
  missile: ['KeyF'],
  bomb: ['KeyG'],
  flares: ['KeyX'],
  nextTarget: ['KeyR'],
  airbrake: ['KeyB'],
  look: ['KeyC'],
  scores: ['Tab'],
  map: ['KeyM'],
  pause: ['KeyP'],
  weaponSrm: ['Digit1'],
  weaponMrm: ['Digit2'],
};

/** How each action reads in the Controls list. */
export const ACTION_LABELS: Readonly<Record<KeyAction, string>> = {
  pitchDown: 'Nose down',
  pitchUp: 'Nose up',
  rollLeft: 'Roll left',
  rollRight: 'Roll right',
  yawLeft: 'Rudder left',
  yawRight: 'Rudder right',
  throttleUp: 'Throttle up',
  throttleDown: 'Throttle down',
  cannon: 'Cannon (hold)',
  missile: 'Missile, once the lock tone sounds',
  bomb: 'Bomb (Strike, Russian jets)',
  flares: 'Flares and chaff',
  nextTarget: 'Next target',
  airbrake: 'Airbrake (hold)',
  look: 'Look around (hold)',
  scores: 'Scores (hold)',
  map: 'Map (press again to close)',
  pause: 'Pause',
  weaponSrm: 'Select short-range missile',
  weaponMrm: 'Select medium-range missile',
};

/** Keys never offered for rebinding: Esc pauses and releases the mouse, and browsers own the function and modifier keys. */
export function canBind(code: string): boolean {
  if (code === 'Escape' || /^F\d{1,2}$/.test(code)) return false;
  return !/^(Control|Meta|Alt|OS)(Left|Right)?$/.test(code) && code !== 'ContextMenu' && code.length > 0;
}

/** Spare keys handed to an action whose stored keys all clashed (only after storage was edited by hand). */
const SPARE_KEYS = ['KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'KeyO', 'KeyN', 'KeyV', 'KeyT', 'KeyY'];

/**
 * Binds `code` as the primary key of `action`. A key that another action uses moves over: if it was that action's
 * primary, the two swap primaries, so no action is ever left without a key.
 */
export function rebind(bindings: Bindings, action: KeyAction, code: string): Bindings {
  if (!canBind(code)) return bindings;
  const oldPrimary = bindings[action][0];
  const next = {} as Record<KeyAction, readonly string[]>;
  for (const a of BINDABLE_ACTIONS) {
    const keys = bindings[a];
    if (a === action) {
      next[a] = [code, ...keys.slice(1).filter((k) => k !== code)];
    } else if (keys[0] === code) {
      next[a] = [oldPrimary, ...keys.slice(1).filter((k) => k !== oldPrimary)];
    } else {
      next[a] = keys.filter((k) => k !== code);
    }
  }
  return next;
}

/** Repairs bindings read from storage: valid keys only, each key used once, every action bound. */
export function sanitizeBindings(stored: unknown): Bindings {
  const raw = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  const used = new Set<string>();
  const out = {} as Record<KeyAction, readonly string[]>;
  const take = (codes: readonly unknown[]): string[] => {
    const kept: string[] = [];
    for (const c of codes) {
      if (typeof c !== 'string' || !canBind(c) || used.has(c)) continue;
      kept.push(c);
      used.add(c);
    }
    return kept;
  };
  for (const a of BINDABLE_ACTIONS) {
    const value = raw[a];
    let keys = Array.isArray(value) ? take(value) : [];
    if (keys.length === 0) keys = take(DEFAULT_BINDINGS[a]);
    if (keys.length === 0) keys = take(SPARE_KEYS).slice(0, 1);
    out[a] = keys;
  }
  return out;
}

export function actionsFor(bindings: Bindings, code: string): KeyAction[] {
  return BINDABLE_ACTIONS.filter((a) => bindings[a].includes(code));
}

const NAMED_KEYS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'Shift',
  ShiftRight: 'Right Shift',
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace',
  CapsLock: 'Caps Lock',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** "KeyW" → "W", "Digit1" → "1", "ArrowUp" → "↑", "Numpad4" → "Num 4". */
export function keyLabel(code: string): string {
  if (code in NAMED_KEYS) return NAMED_KEYS[code];
  const m = /^(?:Key|Digit)(.+)$/.exec(code);
  if (m) return m[1];
  const num = /^Numpad(.+)$/.exec(code);
  if (num) return `Num ${num[1]}`;
  return code;
}

export function keysLabel(codes: readonly string[]): string {
  return codes.map(keyLabel).join(' · ');
}
