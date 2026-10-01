import { describe, expect, it } from 'vitest';
import type { ObjectiveStatus, ZoneStatus } from '../../shared/modes/mode.ts';
import { objectiveLines, progressForMe, sentinelDownText, zoneActivity, zoneEventText, zoneFeedText, zoneSide } from './objective-hud.ts';

const zone = (progress: number, owner: ZoneStatus['owner'], usa: number, russia: number): ZoneStatus => ({
  id: 'B',
  x: 0,
  z: 0,
  radiusM: 4000,
  floorM: 1000,
  ceilingM: 7000,
  progress,
  owner,
  inside: { usa, russia },
});

describe('objective HUD text (M5)', () => {
  it('tells the pilot inside a zone what is happening there', () => {
    expect(zoneActivity(zone(0.64, null, 1, 0), 'usa')).toBe('CAPTURING ZONE B 64%');
    expect(zoneActivity(zone(-0.25, 'russia', 2, 1), 'usa')).toBe('NEUTRALIZING ZONE B 75%');
    expect(zoneActivity(zone(0.4, null, 0, 2), 'russia')).toBe('NEUTRALIZING ZONE B 60%');
    expect(zoneActivity(zone(1, 'usa', 1, 0), 'usa')).toBe('HOLDING ZONE B');
    expect(zoneActivity(zone(1, 'usa', 1, 1), 'usa')).toBe('ZONE B CONTESTED');
    expect(zoneActivity(zone(1, 'usa', 1, 3), 'usa')).toBe('ZONE B OUTNUMBERED 1:3');
    expect(progressForMe(zone(0.3, null, 0, 0), 'russia')).toBeCloseTo(-0.3, 9);
    expect(zoneSide(null, 'usa')).toBe('neutral');
    expect(zoneSide('russia', 'russia')).toBe('mine');
  });

  it('words zone changes and Sentinel losses from the local side', () => {
    expect(zoneEventText('A', 'usa', null, 'usa')).toBe('ZONE A CAPTURED');
    expect(zoneEventText('A', 'russia', null, 'usa')).toBe('ZONE A TAKEN BY RUSSIA');
    expect(zoneEventText('A', null, 'usa', 'usa')).toBe('ZONE A LOST');
    expect(zoneEventText('A', null, 'russia', 'usa')).toBe('ZONE A NEUTRALIZED');
    expect(zoneFeedText('C', 'russia', null)).toBe('Russia captured zone C');
    expect(zoneFeedText('C', null, 'usa')).toBe('USA lost zone C');
    expect(sentinelDownText('usa', 'usa')).toMatch(/DATALINK LOST/);
    expect(sentinelDownText('russia', 'usa')).toMatch(/ENEMY SENTINEL DOWN/);
  });

  it('counts Sentinels in the air and shows which datalink is down', () => {
    const o: ObjectiveStatus = {
      sentinels: [
        { id: 1, team: 'usa', alive: true, returnInS: null },
        { id: 2, team: 'usa', alive: false, returnInS: 80 },
        { id: 3, team: 'russia', alive: true, returnInS: null },
        { id: 4, team: 'russia', alive: true, returnInS: null },
      ],
      datalinkDownS: { usa: 42, russia: 0 },
      sentinelsDestroyed: { usa: 0, russia: 1 },
    };
    const lines = objectiveLines(o, 'usa');
    expect(lines[0].map(([t]) => t).join('')).toBe('SENTINELS 1 : 2');
    expect(lines[1][0]).toEqual(['DATALINK DOWN 0:42', 'theirs']);
    expect(objectiveLines(o, 'russia')[1][0]).toEqual(['ENEMY DATALINK DOWN 0:42', 'mine']);
  });
});
