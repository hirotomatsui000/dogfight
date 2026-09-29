import { listAircraft, TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { AircraftConfig } from '../../shared/data/aircraft/types.ts';
import { G0 } from '../../shared/math/units.ts';
import type { ControlMode } from '../input/control-mapper.ts';
import { isTouchOnly } from './device.ts';
import { loadSetting, saveSetting } from './storage.ts';

export interface StartOptions {
  aircraftId: string;
  callsign: string;
  controlMode: ControlMode;
}

const sanitizeCallsign = (s: string) => s.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 16) || 'Pilot';

function statsFor(c: AircraftConfig): [string, string][] {
  const p = c.physics;
  return [
    ['Top speed', `Mach ${c.performance.topSpeedMach11km[0].toFixed(1)}+`],
    ['Thrust / weight', (p.thrustAbN / (p.massKg * G0)).toFixed(2)],
    ['Roll rate', `${p.maxRollRateDegS}°/s`],
    ['Stealth', `${Math.round(c.sensors.stealth * 100)}%`],
    ['Missiles', `${c.stores.srm} SR / ${c.stores.mrm} MR`],
    ['Cannon', `${c.stores.cannon} · ${c.stores.cannonRounds} rds`],
  ];
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
  subtitle.textContent = 'Prototype · Free flight over the test range';
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

  const controlField = document.createElement('label');
  controlField.className = 'field';
  const controlLabel = document.createElement('span');
  controlLabel.textContent = 'Controls';
  const control = document.createElement('select');
  for (const [value, text] of [['mouse-aim', 'Mouse aim (recommended)'], ['direct', 'Keyboard direct']] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    control.appendChild(option);
  }
  control.value = loadSetting<ControlMode>('controlMode', 'mouse-aim');
  controlField.append(controlLabel, control);
  row.append(callsignField, controlField);
  panel.appendChild(row);

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
    '<kbd>Mouse</kbd> aim (click the view to capture the mouse)',
    '<kbd>W</kbd>/<kbd>S</kbd> pitch · <kbd>A</kbd>/<kbd>D</kbd> roll · <kbd>Q</kbd>/<kbd>E</kbd> rudder',
    '<kbd>Shift</kbd>/<kbd>Z</kbd> or wheel throttle (top = afterburner) · <kbd>B</kbd> airbrake',
    '<kbd>C</kbd> or right mouse: look around · <kbd>V</kbd> camera (HUD / chase / free) · <kbd>P</kbd> or <kbd>Esc</kbd> pause',
  ].join('<br>');
  panel.appendChild(help);

  start.addEventListener('click', () => {
    const options: StartOptions = {
      aircraftId: selected,
      callsign: sanitizeCallsign(callsign.value),
      controlMode: control.value === 'direct' ? 'direct' : 'mouse-aim',
    };
    saveSetting('aircraft', options.aircraftId);
    saveSetting('callsign', options.callsign);
    saveSetting('controlMode', options.controlMode);
    onStart(options);
  });

  root.appendChild(overlay);
  start.focus();
  return () => overlay.remove();
}
