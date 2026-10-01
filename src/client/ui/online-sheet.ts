import { DEFAULT_ROOM, ONLINE_MODES, type OnlineModeId, sanitizeRoomName } from '../../shared/net/protocol.ts';

interface RoomInfo {
  name: string;
  mode: string;
  /** the room's map (M4; older servers leave it out) */
  map?: string;
  humans: number;
  maxHumans: number;
}

const MODE_LABELS: Readonly<Record<string, string>> = {
  'team-deathmatch': 'Dogfight',
  'air-superiority': 'Air Superiority',
  'team-objective': 'Team Objective',
  'free-flight': 'Free Flight',
  strike: 'Strike',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The busiest room with a free seat, or the public room (spec §24: Quick play). */
export function quickPlayRoom(rooms: readonly RoomInfo[]): string {
  return rooms.find((r) => r.humans < r.maxHumans)?.name ?? DEFAULT_ROOM;
}

/** The page address that drops a friend straight into `room` (spec §24: invite links). */
export function inviteLink(location: { origin: string; pathname: string }, room: string): string {
  return `${location.origin}${location.pathname}?room=${encodeURIComponent(sanitizeRoomName(room))}`;
}

/**
 * "Play online": choose or type a room, Quick play into the busiest one, or copy an invite link. The room's mode is
 * set by whoever opens it (the mode chosen here, the title screen's Mission by default; M5); your jet decides your
 * team.
 */
export function onlineSheet(initialRoom: string, mission: () => string, onJoin: (room: string, mode: OnlineModeId) => void): HTMLDialogElement {
  const dialog = el('dialog', 'sheet online');
  dialog.setAttribute('aria-labelledby', 'online-title');
  const form = el('form');
  form.method = 'dialog';
  const title = el('h2', 'sheet-title', 'Play online');
  title.id = 'online-title';
  const status = el('p', 'sheet-note', 'Looking for the game server…');
  status.setAttribute('aria-live', 'polite');
  const roomLabel = el('label', 'setting-row online-room');
  const roomInput = el('input', 'pilot-input');
  roomInput.value = sanitizeRoomName(initialRoom);
  roomInput.maxLength = 24;
  roomInput.autocomplete = 'off';
  roomInput.spellcheck = false;
  roomLabel.append(el('span', 'setting-name', 'Room'), roomInput);
  // The mode a new room plays (M5): every online mode, Free Flight included.
  const modeLabel = el('label', 'setting-row online-room');
  const modeSelect = el('select', 'world-select');
  for (const m of ONLINE_MODES) {
    const o = el('option', undefined, MODE_LABELS[m]);
    o.value = m;
    modeSelect.appendChild(o);
  }
  modeLabel.append(el('span', 'setting-name', 'New room plays'), modeSelect);
  const list = el('div', 'room-list');
  const join = el('button', 'button', 'Join room');
  join.type = 'button';
  const quick = el('button', 'button secondary', 'Quick play');
  quick.type = 'button';
  const invite = el('button', 'link', 'Copy invite link');
  invite.type = 'button';
  const buttons = el('div', 'online-buttons');
  buttons.append(join, quick);
  const note = el('p', 'sheet-note');
  const privacy = el(
    'p',
    'sheet-note',
    'No accounts and no tracking. The game server sees your callsign, your jet and your network address while you play. If this page hits an error, the error and your address go to the server log.',
  );
  const close = el('button', 'link', 'Close');
  close.value = 'close';
  form.append(title, status, roomLabel, modeLabel, list, buttons, invite, note, privacy, close);
  dialog.appendChild(form);

  let rooms: RoomInfo[] = [];
  const setEnabled = (on: boolean) => {
    join.disabled = !on;
    quick.disabled = !on;
  };
  const refresh = async () => {
    note.textContent = 'Everyone in a room shares one sky; bots fly the empty seats (none in Free Flight). Joining a room plays its own mode; your jet sets your team.';
    setEnabled(false);
    status.textContent = 'Looking for the game server…';
    list.replaceChildren();
    try {
      const res = await fetch('/api/rooms', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      rooms = ((await res.json()) as { rooms: RoomInfo[] }).rooms;
      status.textContent = rooms.length === 0 ? 'Server online. No rooms yet: yours will be the first.' : 'Server online. Rooms now:';
      for (const r of rooms.slice(0, 6)) {
        const where = r.map === 'lechovia' ? ' · Lechovia' : r.map === 'test-range' ? ' · Test range' : '';
        const b = el('button', 'room-chip', `${r.name} · ${MODE_LABELS[r.mode] ?? r.mode}${where} · ${r.humans}/${r.maxHumans}`);
        b.type = 'button';
        b.addEventListener('click', () => {
          roomInput.value = r.name;
        });
        list.appendChild(b);
      }
      setEnabled(true);
    } catch {
      status.textContent = 'Online play needs the game server, and this page was not opened from one. Open the address the server prints (npm start), or play offline.';
    }
  };
  dialog.addEventListener('toggle', () => {
    if (!dialog.open) return;
    modeSelect.value = ONLINE_MODES.find((m) => m === mission()) ?? 'team-deathmatch';
    void refresh();
  });
  const chosen = () => ONLINE_MODES.find((m) => m === modeSelect.value) ?? 'team-deathmatch';
  join.addEventListener('click', () => {
    dialog.close();
    onJoin(sanitizeRoomName(roomInput.value), chosen());
  });
  quick.addEventListener('click', () => {
    dialog.close();
    onJoin(quickPlayRoom(rooms), chosen());
  });
  invite.addEventListener('click', () => {
    const link = inviteLink(location, roomInput.value);
    navigator.clipboard?.writeText(link).then(
      () => (invite.textContent = 'Link copied'),
      () => (invite.textContent = link),
    );
  });
  return dialog;
}
