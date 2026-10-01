/**
 * The game server (spec §16): the site from dist/, the game WebSocket at /ws, and the rooms.
 *
 * Run: npm run build && npm start      (or: node src/server/main.ts --port=8080)
 * Development: `npm run dev` (Vite, proxies /ws and /api here) with `npm run server` alongside.
 */
import { loadConfig } from './config.ts';
import { readSiteBuild } from './http.ts';
import { lanUrls, startServer } from './server.ts';

const config = loadConfig();
// The page and the server must come from the same build for the version check (spec §24).
config.build = readSiteBuild(config.distDir) ?? config.build;
const server = await startServer(config);
console.log(`Contested Skies server (build ${config.build}) on port ${server.port}`);
console.log(`  this machine:  http://localhost:${server.port}`);
for (const url of lanUrls(server.port)) console.log(`  network:       ${url}`);
if (!config.distDir || !readSiteBuild(config.distDir)) console.log('  (no site build in dist/: run `npm run build`, or open the Vite dev server)');

let stopping = false;
const stop = (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: telling players and shutting down`);
  void server.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
