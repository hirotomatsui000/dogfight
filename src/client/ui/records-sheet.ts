import { type Career, emptyCareer, loadCareer, saveCareer } from '../career.ts';
import { aircraftName, bestRows, careerTotals, formatDate, missionLabel, outcomeLabel, recentLabel } from './records-format.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function table(head: readonly string[], rows: readonly (readonly string[])[]): HTMLTableElement {
  const t = el('table', 'results');
  const tr = t.insertRow();
  for (const h of head) tr.appendChild(el('th', undefined, h));
  for (const row of rows) {
    const r = t.insertRow();
    for (const cell of row) r.insertCell().textContent = cell;
  }
  return t;
}

function render(c: Career): HTMLElement[] {
  if (c.matches === 0) {
    return [el('p', 'sheet-note', 'No finished matches yet. Fly a Dogfight, Air Superiority, Team Objective or Strike match to the end and it shows up here.')];
  }
  const totals = el('dl', 'keys');
  for (const [k, v] of careerTotals(c)) totals.append(el('dt', undefined, k), el('dd', undefined, v));
  const parts: HTMLElement[] = [totals];
  const bests = bestRows(c);
  if (bests.length > 0) parts.push(el('h3', 'eyebrow', 'Personal bests'), table(['', 'Best', 'Jet', 'Day'], bests));
  const modes = Object.entries(c.modes).sort((a, b) => b[1].matches - a[1].matches);
  parts.push(el('h3', 'eyebrow', 'By mission'), table(['Mission', 'Matches', 'Won'], modes.map(([id, m]) => [missionLabel(id), String(m.matches), String(m.wins)])));
  const jets = Object.entries(c.jets).sort((a, b) => b[1].matches - a[1].matches || b[1].kills - a[1].kills);
  parts.push(el('h3', 'eyebrow', 'By jet'), table(['Jet', 'Matches', 'Kills', 'Deaths'], jets.map(([id, j]) => [aircraftName(id), String(j.matches), String(j.kills), String(j.deaths)])));
  parts.push(
    el('h3', 'eyebrow', 'Last matches'),
    table(
      ['Day', 'Match', 'Jet', 'Result', 'K', 'D'],
      c.recent.map((r) => [formatDate(r.at), recentLabel(r), aircraftName(r.aircraftId), outcomeLabel(r.result), String(r.kills), String(r.deaths)]),
    ),
  );
  return parts;
}

/**
 * The title screen's Records sheet (revision 17): totals, personal bests, matches by mission and by jet, and the last
 * matches, read fresh from this browser's storage each time it opens. Erasing takes two clicks.
 */
export function recordsSheet(): { dialog: HTMLDialogElement; open(): void } {
  const dialog = el('dialog', 'sheet records-sheet');
  dialog.setAttribute('aria-labelledby', 'records-title');
  const form = el('form');
  form.method = 'dialog';
  const title = el('h2', 'sheet-title', 'Records');
  title.id = 'records-title';
  // Opening focuses the title, so the sheet starts at the top rather than at its Close button.
  title.tabIndex = -1;
  const body = el('div', 'records-body');
  const note = el('p', 'sheet-note', 'Kept in this browser only, with no account. Clearing the site’s data erases them. Training and Free Flight are not counted.');
  const buttons = el('div', 'records-buttons');
  const close = el('button', 'link', 'Close');
  close.value = 'close';
  const erase = el('button', 'link danger', 'Erase records');
  erase.type = 'button';
  let armed = false;
  const fill = () => {
    const career = loadCareer();
    body.replaceChildren(...render(career));
    erase.hidden = career.matches === 0;
    armed = false;
    erase.textContent = 'Erase records';
  };
  erase.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      erase.textContent = 'Click again to erase every record';
      return;
    }
    saveCareer(emptyCareer());
    fill();
  });
  buttons.append(close, erase);
  form.append(title, note, body, buttons);
  dialog.appendChild(form);
  return {
    dialog,
    open() {
      fill();
      dialog.showModal();
      title.focus();
      dialog.scrollTop = 0;
    },
  };
}
