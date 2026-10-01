import { START_HOURS, TIME_OF_DAY_IDS, TIME_OF_DAY_LABELS, type TimeOfDayId } from '../../shared/world/time-of-day.ts';
import { WEATHER, WEATHER_IDS, type WeatherId } from '../../shared/world/weather.ts';
import type { GameSession } from '../session/game-session.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The time-of-day choice nearest to an hour, for showing the clock as one of the four. */
export function nearestTimeOfDay(hour: number): TimeOfDayId {
  let best: TimeOfDayId = 'day';
  let bestD = Infinity;
  for (const id of TIME_OF_DAY_IDS) {
    const raw = Math.abs(START_HOURS[id] - hour);
    const d = Math.min(raw, 24 - raw);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/**
 * Free Flight's controls in the pause menu (spec §13, M5): time of day, the clock and the weather (online, for the
 * whole room), and target drones offline. The map (M) flies you from wherever you click.
 */
export function freeFlightPanel(current: () => GameSession, online: boolean): { element: HTMLElement; refresh(): void } {
  const box = el('div', 'ff-panel');
  box.appendChild(el('p', 'eyebrow', online ? 'Free flight · the whole room shares this sky' : 'Free flight'));
  const row = el('div', 'world-row');
  const select = <T extends string>(label: string, values: readonly T[], names: (v: T) => string, onChange: (v: T) => void) => {
    const sel = el('select', 'world-select');
    sel.setAttribute('aria-label', label);
    sel.title = label;
    for (const v of values) {
      const o = el('option', undefined, names(v));
      o.value = v;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value as T));
    return sel;
  };
  const session = {
    get environment() {
      return current().environment;
    },
    hour: () => current().hour(),
    changeWorld: (w: WeatherId, h: number, c: boolean) => current().changeWorld(w, h, c),
  };
  const time = select('Time of day', TIME_OF_DAY_IDS, (t) => TIME_OF_DAY_LABELS[t], (t) => session.changeWorld(session.environment.weather, START_HOURS[t], session.environment.clockRunning));
  const weather = select('Weather', WEATHER_IDS, (w) => WEATHER[w].label, (w: WeatherId) => session.changeWorld(w, session.hour(), session.environment.clockRunning));
  const clockLabel = el('label', 'world-clock');
  const clock = el('input');
  clock.type = 'checkbox';
  clock.addEventListener('change', () => session.changeWorld(session.environment.weather, session.hour(), clock.checked));
  clockLabel.append(clock, el('span', undefined, 'Clock runs'));
  row.append(time, weather, clockLabel);
  box.appendChild(row);
  let drones: HTMLInputElement | null = null;
  if (current().canCallDrones) {
    const label = el('label', 'world-clock');
    drones = el('input');
    drones.type = 'checkbox';
    drones.addEventListener('change', () => current().setDrones(drones?.checked ?? false));
    label.append(drones, el('span', undefined, 'Target drones (four unarmed enemy jets around you)'));
    box.appendChild(label);
  }
  box.appendChild(el('p', 'sheet-note', 'Press M and click the map to fly from there (click an airfield to start on its runway).'));
  return {
    element: box,
    refresh() {
      time.value = nearestTimeOfDay(session.hour());
      weather.value = session.environment.weather;
      clock.checked = session.environment.clockRunning;
      if (drones) drones.checked = current().modeStatus().drones === true;
    },
  };
}
