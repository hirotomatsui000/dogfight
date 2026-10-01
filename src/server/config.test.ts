import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

describe('server config', () => {
  it('uses the spec defaults', () => {
    expect(loadConfig({}, [])).toMatchObject({ port: 8080, host: '0.0.0.0', maxRooms: 20, maxHumansPerRoom: 16, teamSize: 4, botSkill: 'veteran' });
  });

  it('reads the environment and lets the command line win', () => {
    const c = loadConfig({ PORT: '9000', BOTS_PER_TEAM: '2', BOT_SKILL: 'ace', MAX_ROOMS: 'lots' }, ['--port=9100']);
    expect(c).toMatchObject({ port: 9100, teamSize: 2, botSkill: 'ace', maxRooms: 20 });
  });
});
