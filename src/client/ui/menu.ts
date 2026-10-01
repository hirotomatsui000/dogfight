import { DIFFICULTIES, type DifficultyId } from '../../shared/ai/difficulty.ts';
import { listAircraft, TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { AircraftConfig } from '../../shared/data/aircraft/types.ts';
import type { MapId } from '../../shared/data/maps/registry.ts';
import { SPAWN_STARTS, type SpawnStart } from '../../shared/world/spawns.ts';
import { STRIKE_DEFAULTS, STRIKE_DEFENDER } from '../../shared/modes/strike.ts';
import type { ControlMode } from '../input/control-mapper.ts';
import { controlsHelp, GAMEPAD_HELP } from './controls-help.ts';
import { isTouchOnly } from './device.ts';
import { onlineSheet } from './online-sheet.ts';
import { openSettings } from './settings-screen.ts';
import type { SettingsStore } from './settings.ts';
import { loadSetting, saveSetting } from './storage.ts';

export type MissionId = 'team-deathmatch' | 'free-flight' | 'strike' | 'training';

export interface StartOptions {
  aircraftId: string;
  callsign: string;
  controlMode: ControlMode;
  mission: MissionId;
  difficulty: DifficultyId;
  /** set for online play (M2): the room to join */
  online?: { room: string };
  /** the map for Dogfight and Free Flight (M4); Lechovia when unset */
  map?: MapId;
  /** in the air or on the runway (M4) */
  start?: SpawnStart;
}

export interface StartMenuHandlers {
  onStart(options: StartOptions): void;
  /** The jet currently chosen, for the live scene behind the menu. */
  onPreview(aircraftId: string): void;
}

const CONTROL_MODES: readonly ControlMode[] = ['mouse-aim', 'direct'];
type FlyMission = Exclude<MissionId, 'free-flight' | 'training'>;
const MISSIONS: readonly { value: FlyMission; label: string }[] = [
  { value: 'team-deathmatch', label: 'Dogfight' },
  { value: 'strike', label: 'Strike' },
];
const CONTROL_LABELS: Record<ControlMode, string> = { 'mouse-aim': 'Mouse aim', direct: 'Keyboard' };

export function sanitizeCallsign(s: string): string {
  return s.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 16) || 'Pilot';
}

/** Saved settings can outlive the options they name (or be edited by hand). */
export function pickValid<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/** What the selected jet does in a Strike match (spec §15.5). */
export function strikeRole(c: AircraftConfig): string {
  return c.team === STRIKE_DEFENDER
    ? `${c.name} · ${TEAM_NAMES[c.team]}: hold all three targets for ${STRIKE_DEFAULTS.timeLimitS / 60} minutes`
    : `${c.name} · ${TEAM_NAMES[c.team]}: destroy two of the three targets`;
}

export function aircraftSummary(c: AircraftConfig): string {
  const end = c.description.indexOf('. ');
  return `${c.role} · ${end < 0 ? c.description : c.description.slice(0, end + 1)}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

interface Choice<T extends string> {
  value: T;
  label: string;
  kicker?: string;
}

/**
 * A radio group drawn as HUD designation boxes: the chosen option is boxed like a designated target. With `rowOf`,
 * the options sit in labelled rows (the jets, one row per team).
 */
function choiceGroup<T extends string>(
  name: string,
  legend: string,
  choices: readonly Choice<T>[],
  value: T,
  onChange: (v: T) => void,
  rowOf?: (c: Choice<T>) => string,
): HTMLFieldSetElement {
  const set = el('fieldset', `pick pick-${name}`);
  set.appendChild(el('legend', 'eyebrow', legend));
  const rows = new Map<string, HTMLDivElement>();
  const rowFor = (c: Choice<T>) => {
    const key = rowOf ? rowOf(c) : '';
    let row = rows.get(key);
    if (!row) {
      row = el('div', rowOf ? 'options option-row' : 'options');
      if (rowOf) row.appendChild(el('span', 'option-row-label', key));
      rows.set(key, row);
      set.appendChild(row);
    }
    return row;
  };
  for (const c of choices) {
    const row = rowFor(c);
    const input = el('input', 'sr-only');
    input.type = 'radio';
    input.name = name;
    input.id = `pick-${name}-${c.value}`;
    input.value = c.value;
    input.checked = c.value === value;
    input.addEventListener('change', () => {
      if (input.checked) onChange(c.value);
    });
    const label = el('label', 'option');
    label.htmlFor = input.id;
    // The space keeps screen readers from running "Russia" and "Kobchik" together; grid layout ignores it.
    if (c.kicker) label.append(el('span', 'option-kicker', c.kicker), ' ');
    label.appendChild(el('span', 'option-name', c.label));
    row.append(input, label);
  }
  return set;
}

function titleLockup(): HTMLHeadingElement {
  const h1 = el('h1', 'brand-title');
  h1.setAttribute('aria-label', 'Contested Skies');
  const kicker = el('span', 'brand-kicker');
  kicker.setAttribute('aria-hidden', 'true');
  // One span per letter so the small word can be spread exactly across the width of the big one.
  for (const ch of 'CONTESTED') kicker.appendChild(el('span', undefined, ch));
  const word = el('span', 'brand-word', 'SKIES');
  word.setAttribute('aria-hidden', 'true');
  h1.append(kicker, word);
  return h1;
}

function credits(): HTMLParagraphElement {
  // Required attribution for the CC BY 4.0 satellite imagery (full list: CREDITS.md).
  const p = el('p', 'credits');
  p.innerHTML =
    'Satellite imagery: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> ' +
    'by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2017), ' +
    '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · ' +
    'Sky and ground detail: <a href="https://polyhaven.com" target="_blank" rel="noopener">Poly Haven</a> (CC0) · ' +
    'Water normals: three.js (MIT) · Rajdhani font: Indian Type Foundry (OFL)';
  return p;
}

function controlsSheet(settings: SettingsStore): HTMLDialogElement {
  const dialog = el('dialog', 'sheet');
  dialog.setAttribute('aria-labelledby', 'controls-title');
  const form = el('form');
  form.method = 'dialog';
  const title = el('h2', 'sheet-title', 'Controls');
  title.id = 'controls-title';
  const keys = el('dl', 'keys');
  const fillKeys = (m: ControlMode) => {
    keys.replaceChildren();
    for (const [k, action] of controlsHelp(m, settings.current.keys)) keys.append(el('dt', undefined, k), el('dd', undefined, action));
  };
  const steering = choiceGroup(
    'steering',
    'Steering',
    CONTROL_MODES.map((m) => ({ value: m, label: CONTROL_LABELS[m] })),
    settings.current.controlMode,
    (m) => {
      fillKeys(m);
      settings.update({ controlMode: m });
    },
  );
  // Keys may have been rebound in Settings since the sheet was built.
  dialog.addEventListener('toggle', () => fillKeys(settings.current.controlMode));
  fillKeys(settings.current.controlMode);
  const pad = el('dl', 'keys');
  for (const [k, action] of GAMEPAD_HELP) pad.append(el('dt', undefined, k), el('dd', undefined, action));
  const note = el('p', 'sheet-note', 'Click the game view to capture the mouse. Esc releases it and pauses. Change keys, mouse and gamepad in Settings.');
  const close = el('button', 'link', 'Close');
  close.value = 'close';
  form.append(title, steering, keys, el('h3', 'eyebrow', 'Gamepad'), pad, note, close);
  dialog.appendChild(form);
  return dialog;
}

/** Shows the title screen over the live scene. Returns a cleanup function that removes it. */
export function showStartMenu(root: HTMLElement, handlers: StartMenuHandlers, settings: SettingsStore): () => void {
  const aircraft = listAircraft();
  const ids = aircraft.map((a) => a.id);
  let aircraftId = pickValid(loadSetting<unknown>('aircraft', ids[0]), ids, ids[0]);
  let difficulty = pickValid(loadSetting<unknown>('difficulty', 'rookie'), Object.keys(DIFFICULTIES) as DifficultyId[], 'rookie');
  let mission = pickValid(
    loadSetting<unknown>('mission', 'team-deathmatch'),
    MISSIONS.map((m) => m.value),
    'team-deathmatch',
  );

  const screen = el('div', 'start');
  const form = el('form', 'start-form');
  form.noValidate = true;

  const top = el('div', 'start-top');
  const pilot = el('label', 'pilot');
  const callsign = el('input', 'pilot-input');
  callsign.maxLength = 16;
  callsign.autocomplete = 'off';
  callsign.spellcheck = false;
  callsign.value = sanitizeCallsign(String(loadSetting<unknown>('callsign', 'Pilot')));
  pilot.append(el('span', 'eyebrow', 'Pilot'), callsign);
  top.appendChild(pilot);

  const main = el('div', 'start-main');
  const brand = el('header', 'brand');
  brand.append(titleLockup(), el('p', 'brand-tag', 'Jet dogfight · AI pilots or online'));
  if (typeof window.matchMedia === 'function' && isTouchOnly((q) => window.matchMedia(q))) {
    const notice = el('p', 'notice', 'This game needs a keyboard and mouse. Open it on a desktop or laptop computer.');
    notice.setAttribute('role', 'status');
    brand.appendChild(notice);
  }

  const summary = el('p', 'pick-note');
  summary.setAttribute('aria-live', 'polite');
  // In Strike the line under the jets says what the chosen jet must do; otherwise it describes the jet.
  const showSummary = () => {
    const a = aircraft.find((x) => x.id === aircraftId) ?? aircraft[0];
    summary.textContent = mission === 'strike' ? strikeRole(a) : aircraftSummary(a);
  };
  const jets = choiceGroup(
    'aircraft',
    'Aircraft',
    aircraft.map((a) => ({ value: a.id, label: a.name })),
    aircraftId,
    (id) => {
      aircraftId = id;
      saveSetting('aircraft', id);
      showSummary();
      handlers.onPreview(id);
    },
    (c) => TEAM_NAMES[aircraft.find((a) => a.id === c.value)?.team ?? 'usa'],
  );
  jets.appendChild(summary);
  showSummary();

  const missions = choiceGroup('mission', 'Mission', MISSIONS, mission, (m) => {
    mission = m;
    saveSetting('mission', m);
    showSummary();
  });

  const skill = choiceGroup(
    'skill',
    'Opponent',
    Object.values(DIFFICULTIES).map((d) => ({ value: d.id, label: d.label })),
    difficulty,
    (d) => {
      difficulty = d;
      saveSetting('difficulty', d);
    },
  );

  const launch = el('div', 'launch');
  const fly = el('button', 'fly', 'Fly');
  fly.type = 'submit';
  const onlineButton = el('button', 'online-button', 'Online');
  onlineButton.type = 'button';
  onlineButton.title = 'Fly against other people in a room';
  onlineButton.setAttribute('aria-haspopup', 'dialog');
  const launchRow = el('div', 'launch-row');
  launchRow.append(fly, onlineButton);
  const links = el('div', 'links');
  const training = el('button', 'link', 'Training');
  training.type = 'button';
  training.title = 'Learn to fly, shoot and beat a missile (about 3 minutes)';
  if (!settings.current.trainingDone) training.appendChild(el('span', 'link-badge', 'New'));
  const freeFlight = el('button', 'link', 'Free flight');
  freeFlight.type = 'button';
  freeFlight.title = 'Fly without enemies';
  const controlsLink = el('button', 'link', 'Controls');
  controlsLink.type = 'button';
  controlsLink.setAttribute('aria-haspopup', 'dialog');
  const settingsLink = el('button', 'link', 'Settings');
  settingsLink.type = 'button';
  settingsLink.setAttribute('aria-haspopup', 'dialog');
  links.append(training, freeFlight, controlsLink, settingsLink);
  launch.append(launchRow, links);

  main.append(brand, missions, jets, skill, launch);
  form.append(top, main, credits());

  const sheet = controlsSheet(settings);
  const invitedRoom = new URLSearchParams(location.search).get('room');
  const online = onlineSheet(invitedRoom ?? 'public', () => (mission === 'strike' ? 'Strike' : 'Dogfight'), (room) => start(mission, { room }));
  screen.append(form, sheet, online);

  const start = (mission: MissionId, onlineRoom?: { room: string }) => {
    const start = pickValid(loadSetting<unknown>('start', 'air'), SPAWN_STARTS, 'air');
    const options: StartOptions = { aircraftId, callsign: sanitizeCallsign(callsign.value), controlMode: settings.current.controlMode, mission, difficulty, online: onlineRoom, start };
    saveSetting('aircraft', options.aircraftId);
    saveSetting('callsign', options.callsign);
    saveSetting('difficulty', options.difficulty);
    handlers.onStart(options);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    start(mission);
  });
  freeFlight.addEventListener('click', () => start('free-flight'));
  training.addEventListener('click', () => start('training'));
  controlsLink.addEventListener('click', () => sheet.showModal());
  onlineButton.addEventListener('click', () => online.showModal());
  settingsLink.addEventListener('click', () => openSettings(root, settings, 'controls'));

  root.appendChild(screen);
  handlers.onPreview(aircraftId);
  fly.focus();
  // An invite link (?room=name) opens the online sheet on that room.
  if (invitedRoom) online.showModal();
  return () => screen.remove();
}
