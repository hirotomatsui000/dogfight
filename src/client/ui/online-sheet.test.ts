import { describe, expect, it } from 'vitest';
import { inviteLink, quickPlayRoom } from './online-sheet.ts';

describe('online helpers', () => {
  it('quick play picks the busiest room with a free seat, else the public room', () => {
    expect(quickPlayRoom([{ name: 'full', mode: 'strike', humans: 16, maxHumans: 16 }, { name: 'busy', mode: 'team-deathmatch', humans: 5, maxHumans: 16 }])).toBe('busy');
    expect(quickPlayRoom([])).toBe('public');
  });

  it('builds invite links with a clean room name', () => {
    expect(inviteLink({ origin: 'http://192.168.1.5:8080', pathname: '/' }, 'Friday Night')).toBe('http://192.168.1.5:8080/?room=friday-night');
  });
});
