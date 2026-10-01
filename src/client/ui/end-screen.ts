import { opposingTeam, TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import type { ModeStatus } from '../../shared/modes/mode.ts';

export interface ResultRow {
  callsign: string;
  aircraft: string;
  team: TeamId;
  kills: number;
  deaths: number;
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
  return { title, detail, note: null };
}

export interface EndScreenHandlers {
  onAgain(): void;
  onMenu(): void;
  /** the main button's text; "Fly again" by default */
  againLabel?: string;
}

/** Match results with "Fly again" and "Main menu". Returns a cleanup function. */
export function showEndScreen(root: HTMLElement, result: MatchResult, rows: readonly ResultRow[], handlers: EndScreenHandlers): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay translucent';
  const panel = document.createElement('div');
  panel.className = 'panel narrow stack';
  const title = document.createElement('h2');
  title.className = 'result-title';
  title.textContent = result.title;
  const detail = document.createElement('p');
  detail.className = 'subtitle';
  detail.textContent = result.detail;
  const parts: HTMLElement[] = [title, detail];
  if (result.note) {
    const note = document.createElement('p');
    note.className = 'subtitle';
    note.textContent = result.note;
    parts.push(note);
  }
  const table = document.createElement('table');
  table.className = 'results';
  const head = table.insertRow();
  for (const text of ['Pilot', 'Aircraft', 'K', 'D']) {
    const th = document.createElement('th');
    th.textContent = text;
    head.appendChild(th);
  }
  for (const r of rows) {
    const tr = table.insertRow();
    if (r.isLocal) tr.className = 'me';
    for (const text of [r.callsign, r.aircraft, String(r.kills), String(r.deaths)]) tr.insertCell().textContent = text;
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
  panel.append(...parts, table, again, menu);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  again.focus();
  return () => overlay.remove();
}
