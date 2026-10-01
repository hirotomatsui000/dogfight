import { DIFFICULTIES, type DifficultyId } from '../shared/ai/difficulty.ts';
import type { RoomSettings } from './room-manager.ts';

export interface ServerConfig extends RoomSettings {
  port: number;
  host: string;
  /** the multi-file site build (`npm run build`); null serves no pages */
  distDir: string | null;
}

const int = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = v === undefined ? Number.NaN : Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Settings from the environment (spec §16), with `--port=` style command-line overrides. */
export function loadConfig(env: Record<string, string | undefined> = process.env, argv: readonly string[] = process.argv.slice(2)): ServerConfig {
  const args: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2];
  }
  const get = (name: string, envName: string) => args[name] ?? env[envName];
  const skill = get('bot-skill', 'BOT_SKILL');
  return {
    port: int(get('port', 'PORT'), 8080, 0, 65535),
    host: get('host', 'HOST') ?? '0.0.0.0',
    maxRooms: int(get('max-rooms', 'MAX_ROOMS'), 20, 1, 1000),
    maxHumansPerRoom: int(get('max-humans', 'MAX_HUMANS_PER_ROOM'), 16, 1, 64),
    teamSize: int(get('bots-per-team', 'BOTS_PER_TEAM'), 4, 0, 16),
    botSkill: skill !== undefined && skill in DIFFICULTIES ? (skill as DifficultyId) : 'veteran',
    build: get('build', 'BUILD_ID') ?? 'dev',
    idleCloseMs: 30_000,
    distDir: get('dist', 'DIST_DIR') ?? 'dist',
  };
}
