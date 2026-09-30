import { DIFFICULTIES, type DifficultyId } from '../../shared/ai/difficulty.ts';
import { listAircraft, TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { AircraftConfig } from '../../shared/data/aircraft/types.ts';
import { G0 } from '../../shared/math/units.ts';
import type { ControlMode } from '../input/control-mapper.ts';
import { isTouchOnly } from './device.ts';
import { loadSetting, saveSetting } from './storage.ts';

export type MissionId = 'team-deathmatch' | 'free-flight';

export interface StartOptions {
  aircraftId: string;
  callsign: string;
  controlMode: ControlMode;
  mission: MissionId;
  difficulty: DifficultyId;
}

export function sanitizeCallsign(s: string): string {
  return s.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 16) || 'Pilot';
}

export function statsFor(c: AircraftConfig): [string, string][] {
  const p = c.physics;
  return [
    ['Top speed', `Mach ${c.performance.topSpeedMach11km[0].toFixed(1)}+`],
    ['Thrust / weight', (p.thrustAbN / (p.massKg * G0)).toFixed(2)],
    ['Roll rate', `${p.maxRollRateDegS}°/s`],
    ['Hit points', String(c.damage.hitPoints)],
    ['Missiles', `${c.stores.srm} short-range${c.sensors.helmetSight ? ' · helmet sight' : ''}`],
    ['Cannon', `${c.stores.cannon} · ${c.stores.cannonRounds} rds`],
  ];
}

function select<T extends string>(label: string, options: readonly (readonly [T, string])[], value: T): { field: HTMLLabelElement; input: HTMLSelectElement } {
  const field = document.createElement('label');
  field.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('select');
  for (const [v, text] of options) {
    const option = document.createElement('option');
    option.value = v;
    option.textContent = text;
    input.appendChild(option);
  }
  input.value = value;
  field.append(span, input);
  return { field, input };
}

/** Shows the start screen. Returns a cleanup function that removes it. */
export function showStartMenu(root: HTMLElement, onStart: (o: StartOptions) => void): () => void {
  const aircraft = listAircraft();
  let selected = loadSetting('aircraft', aircraft[0].id);
  if (!aircraft.some((a) => a.id === selected)) selected = aircraft[0].id;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const panel = document.createElement('div');
  panel.className = 'panel';
  overlay.appendChild(panel);

  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = 'CONTESTED SKIES';
  const subtitle = document.createElement('p');
  subtitle.className = 'subtitle';
  subtitle.textContent = 'Prototype · Dogfight an AI pilot over the test range';
  panel.append(title, subtitle);

  if (typeof window.matchMedia === 'function' && isTouchOnly((q) => window.matchMedia(q))) {
    const notice = document.createElement('p');
    notice.className = 'notice';
    notice.setAttribute('role', 'status');
    notice.textContent =
      'This prototype needs a keyboard and mouse — touch controls are not supported yet. Please open it on a desktop or laptop computer.';
    panel.appendChild(notice);
  }

  const row = document.createElement('div');
  row.className = 'row';
  const callsignField = document.createElement('label');
  callsignField.className = 'field';
  const callsignLabel = document.createElement('span');
  callsignLabel.textContent = 'Callsign';
  const callsign = document.createElement('input');
  callsign.maxLength = 16;
  callsign.value = loadSetting('callsign', 'Pilot');
  callsignField.append(callsignLabel, callsign);
  const control = select<ControlMode>('Controls', [['mouse-aim', 'Mouse aim (recommended)'], ['direct', 'Keyboard direct']], loadSetting<ControlMode>('controlMode', 'mouse-aim'));
  row.append(callsignField, control.field);
  panel.appendChild(row);

  const row2 = document.createElement('div');
  row2.className = 'row';
  const mission = select<MissionId>('Mission', [['team-deathmatch', 'Dogfight vs AI'], ['free-flight', 'Free flight']], loadSetting<MissionId>('mission', 'team-deathmatch'));
  const difficultyOptions = Object.values(DIFFICULTIES).map((d) => [d.id, d.label] as const);
  const difficulty = select<DifficultyId>('Opponent', difficultyOptions, loadSetting<DifficultyId>('difficulty', 'rookie'));
  const syncDifficulty = () => {
    difficulty.input.disabled = mission.input.value !== 'team-deathmatch';
  };
  mission.input.addEventListener('change', syncDifficulty);
  syncDifficulty();
  row2.append(mission.field, difficulty.field);
  panel.appendChild(row2);

  const cards = document.createElement('div');
  cards.className = 'cards';
  const buttons: HTMLButtonElement[] = [];
  for (const a of aircraft) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.setAttribute('aria-pressed', String(a.id === selected));
    const name = document.createElement('h3');
    name.textContent = a.name;
    const team = document.createElement('div');
    team.className = 'team';
    team.textContent = `${TEAM_NAMES[a.team]} · ${a.role}`;
    const desc = document.createElement('p');
    desc.textContent = a.description;
    const stats = document.createElement('dl');
    stats.className = 'stats';
    for (const [k, v] of statsFor(a)) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      stats.append(dt, dd);
    }
    card.append(name, team, desc, stats);
    card.addEventListener('click', () => {
      selected = a.id;
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === card));
    });
    buttons.push(card);
    cards.appendChild(card);
  }
  panel.appendChild(cards);

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'button';
  start.textContent = 'Take off';
  panel.appendChild(start);

  const help = document.createElement('div');
  help.className = 'help';
  help.innerHTML = [
    '<kbd>Mouse</kbd> aim (click the view to capture the mouse) · <kbd>W</kbd>/<kbd>S</kbd> <kbd>A</kbd>/<kbd>D</kbd> <kbd>Q</kbd>/<kbd>E</kbd> override',
    '<kbd>Space</kbd> or left click: cannon · <kbd>F</kbd> missile (needs a lock tone) · <kbd>X</kbd> flares · <kbd>R</kbd> next target',
    '<kbd>Shift</kbd>/<kbd>Z</kbd> or wheel throttle (top = afterburner) · <kbd>B</kbd> airbrake · <kbd>C</kbd> or right mouse: look around',
    '<kbd>V</kbd> camera · <kbd>Tab</kbd> scores · <kbd>P</kbd> or <kbd>Esc</kbd> pause',
  ].join('<br>');
  panel.appendChild(help);

  // Required attribution for the CC BY 4.0 satellite imagery (full list: CREDITS.md).
  const credits = document.createElement('p');
  credits.className = 'credits';
  credits.innerHTML =
    'Satellite imagery: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> ' +
    'by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2017), ' +
    '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · ' +
    'Sky and ground detail: <a href="https://polyhaven.com" target="_blank" rel="noopener">Poly Haven</a> (CC0) · ' +
    'Water normals: three.js (MIT)';
  panel.appendChild(credits);

  start.addEventListener('click', () => {
    const options: StartOptions = {
      aircraftId: selected,
      callsign: sanitizeCallsign(callsign.value),
      controlMode: control.input.value === 'direct' ? 'direct' : 'mouse-aim',
      mission: mission.input.value === 'free-flight' ? 'free-flight' : 'team-deathmatch',
      difficulty: difficulty.input.value in DIFFICULTIES ? (difficulty.input.value as DifficultyId) : 'rookie',
    };
    saveSetting('aircraft', options.aircraftId);
    saveSetting('callsign', options.callsign);
    saveSetting('controlMode', options.controlMode);
    saveSetting('mission', options.mission);
    saveSetting('difficulty', options.difficulty);
    onStart(options);
  });

  root.appendChild(overlay);
  start.focus();
  return () => overlay.remove();
}
