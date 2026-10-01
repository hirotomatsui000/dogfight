import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { RoomManager } from './room-manager.ts';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export interface HttpContext {
  manager: RoomManager;
  distDir: string | null;
  build: string;
  startedAtMs: number;
}

/** Error reports per client address per minute (spec §24: browser error reporting, rate-limited). */
const ERROR_REPORTS_PER_MIN = 10;
const MAX_ERROR_BODY = 4096;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** Health check, room list, error reports and the built site (spec §16, §24). */
export function createHttpHandler(ctx: HttpContext): (req: IncomingMessage, res: ServerResponse) => void {
  const reports = new Map<string, { windowStart: number; count: number }>();
  const root = ctx.distDir && existsSync(ctx.distDir) ? resolve(ctx.distDir) : null;

  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (path === '/healthz') {
      sendJson(res, 200, { ok: true, build: ctx.build, rooms: ctx.manager.roomCount, players: ctx.manager.playerCount, uptimeS: Math.round((Date.now() - ctx.startedAtMs) / 1000) });
      return;
    }
    if (path === '/api/rooms' && req.method === 'GET') {
      sendJson(res, 200, { build: ctx.build, rooms: ctx.manager.list() });
      return;
    }
    if (path === '/api/error' && req.method === 'POST') {
      receiveErrorReport(req, res, reports);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (!root) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('No site build here: run `npm run build`, or use `npm run dev` for development.');
      return;
    }
    serveStatic(root, path, req, res);
  };
}

function receiveErrorReport(req: IncomingMessage, res: ServerResponse, reports: Map<string, { windowStart: number; count: number }>): void {
  const who = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const r = reports.get(who);
  if (!r || now - r.windowStart > 60_000) reports.set(who, { windowStart: now, count: 0 });
  const entry = reports.get(who);
  if (!entry || ++entry.count > ERROR_REPORTS_PER_MIN) {
    res.writeHead(429).end();
    req.resume();
    return;
  }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => {
    body += chunk;
    if (body.length > MAX_ERROR_BODY) req.destroy();
  });
  req.on('end', () => {
    console.warn(`Browser error from ${who}: ${body.slice(0, MAX_ERROR_BODY).replace(/\s+/g, ' ')}`);
    res.writeHead(204).end();
  });
}

function serveStatic(root: string, urlPath: string, req: IncomingMessage, res: ServerResponse): void {
  let file: string;
  try {
    file = normalize(join(root, decodeURIComponent(urlPath)));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const type = CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  // Vite names built assets by content hash: cache them for good, but always revalidate the page.
  const immutable = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'content-type': type,
    'content-length': statSync(file).size,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

/** The build id the site was made with (`dist/build.json`), or null. */
export function readSiteBuild(distDir: string | null): string | null {
  if (!distDir) return null;
  try {
    const raw = JSON.parse(readFileSync(join(distDir, 'build.json'), 'utf8')) as { build?: unknown };
    return typeof raw.build === 'string' ? raw.build : null;
  } catch {
    return null;
  }
}
