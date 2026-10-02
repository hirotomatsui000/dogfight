import { opposingTeam, TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import type { ModeStatus } from '../../shared/modes/mode.ts';

export interface ResultRow {
  callsign: string;
  aircraft: string;
  team: TeamId;
  kills: number;
  deaths: number;
  /** damage dealt (M5) */
  damage?: number;
  isLocal: boolean;
}

export interface MatchResult {
  title: string;
  detail: string;
  /** an extra line above the table (Strike: the targets destroyed) */
  note: string | null;
}

/** "Victory" / "Defeat" / "Draw" with the score, or with the reason in Strike, from the local team's point of view. */
export function matchResult(status: ModeStatus, localTeam: TeamId, destroyedTargets: readonly string[] = []): MatchResult {
  if (status.training) return { title: 'Training complete', detail: 'You can fly, shoot and beat a missile', note: 'Next: a dogfight against an AI pilot.' };
  const title = status.winner === localTeam ? 'Victory' : status.winner === 'draw' ? 'Draw' : 'Defeat';
  const s = status.strike;
  if (s && s.reason) {
    const loser = status.winner === s.attacker ? s.defender : s.attacker;
    const detail =
      s.reason === 'targets-destroyed' ? 'TARGETS DESTROYED' : s.reason === 'targets-held' ? 'TARGETS HELD' : `${TEAM_NAMES[loser].toUpperCase()} OUT OF AIRCRAFT`;
    const note = destroyedTargets.length > 0 ? `Destroyed: ${destroyedTargets.join(', ')}` : 'No targets destroyed';
    return { title, detail, note };
  }
  const theirs = opposingTeam(localTeam);
  const scores = status.scores;
  const detail = scores ? `${TEAM_NAMES[localTeam]} ${scores[localTeam]} – ${scores[theirs]} ${TEAM_NAMES[theirs]}` : '';
  return { title, detail, note: modeSummary(status, localTeam) };
}

/** One line on how the objective went (M5): the zones at the end, or the Sentinels each side shot down. */
export function modeSummary(status: ModeStatus, localTeam: TeamId): string | null {
  const theirs = opposingTeam(localTeam);
  if (status.zones && status.zones.length > 0) {
    const owner = (t: TeamId | null) => (t ? TEAM_NAMES[t] : 'nobody');
    return `Zones at the end: ${status.zones.map((z) => `${z.id} ${owner(z.owner)}`).join(' · ')}`;
  }
  if (status.objective) {
    const d = status.objective.sentinelsDestroyed;
    return `Sentinels shot down: ${TEAM_NAMES[localTeam]} ${d[localTeam]} · ${TEAM_NAMES[theirs]} ${d[theirs]}`;
  }
  return null;
}

export interface EndScreenHandlers {
  onAgain(): void;
  onMenu(): void;
  /** the main button's text; "Fly again" by default */
  againLabel?: string;
}

/**
 * Match results with "Fly again" and "Main menu" (M5: damage per pilot, and `flight`, the local pilot's own numbers;
 * revision 17: `highlights`, lines about the career records such as the personal bests this match beat). Returns a
 * cleanup function.
 */
export function showEndScreen(
  root: HTMLElement,
  result: MatchResult,
  rows: readonly ResultRow[],
  handlers: EndScreenHandlers,
  flight: readonly (readonly [string, string])[] = [],
  highlights: readonly string[] = [],
): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay translucent';
  const panel = document.createElement('div');
  panel.className = 'panel results-panel stack';
  const title = document.createElement('h2');
  title.className = 'result-title';
  title.textContent = result.title;
  const detail = document.createElement('p');
  detail.className = 'subtitle';
  detail.textContent = result.detail;
  const parts: HTMLElement[] = [title, detail];
  if (highlights.length > 0) {
    const list = document.createElement('ul');
    list.className = 'new-bests';
    list.setAttribute('aria-label', 'Records');
    for (const line of highlights) {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    }
    parts.push(list);
  }
  if (result.note) {
    const note = document.createElement('p');
    note.className = 'subtitle';
    note.textContent = result.note;
    parts.push(note);
  }
  const table = document.createElement('table');
  table.className = 'results';
  const head = table.insertRow();
  const withDamage = rows.some((r) => r.damage !== undefined);
  for (const text of withDamage ? ['Pilot', 'Aircraft', 'K', 'D', 'Damage'] : ['Pilot', 'Aircraft', 'K', 'D']) {
    const th = document.createElement('th');
    th.textContent = text;
    head.appendChild(th);
  }
  for (const r of rows) {
    const tr = table.insertRow();
    if (r.isLocal) tr.className = 'me';
    const cells = [r.callsign, r.aircraft, String(r.kills), String(r.deaths)];
    if (withDamage) cells.push(String(Math.round(r.damage ?? 0)));
    for (const text of cells) tr.insertCell().textContent = text;
  }
  if (flight.length > 0) {
    const h = document.createElement('h3');
    h.className = 'eyebrow';
    h.textContent = 'Your flight';
    const dl = document.createElement('dl');
    dl.className = 'flight-summary';
    for (const [k, v] of flight) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    parts.push(table, h, dl);
  } else {
    parts.push(table);
  }
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'button';
  again.textContent = handlers.againLabel ?? 'Fly again';
  again.addEventListener('click', () => handlers.onAgain());
  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'button secondary';
  menu.textContent = 'Main menu';
  menu.addEventListener('click', () => handlers.onMenu());
  panel.append(...parts, again, menu);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  again.focus();
  return () => overlay.remove();
}
