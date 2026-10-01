/**
 * Smoke test for a running game server (spec §16): the health check, the page, and two headless pilots that join one
 * room over real WebSockets, fly for a while, see each other and swap a quick-chat line. Exits non-zero on failure.
 *
 *   node tools/smoke-test.ts [http://localhost:8080] [--lag=150] [--seconds=15] [--mode=air-superiority]
 *
 * `--lag` delays both directions like the page's `?lag=`, to check prediction and clock sync at a given round trip.
 * `--mode` opens the room in another mode (M5): team-deathmatch (default), air-superiority, team-objective,
 * free-flight or strike.
 */
import { buildTerrain } from '../src/shared/data/maps/map-definition.ts';
import { createTestRange } from '../src/shared/data/maps/test-range.ts';
import { CALM_NOON } from '../src/shared/world/time-of-day.ts';
import { ONLINE_MODES, type OnlineModeId } from '../src/shared/net/protocol.ts';
import { type ControlInput, neutralInput } from '../src/shared/physics/controls.ts';
import { NetworkSession } from '../src/client/session/network-session.ts';
import { gameServerUrl, LaggedTransport, type Transport, WebSocketTransport } from '../src/client/session/net-transport.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.slice(name.length + 3)) : fallback;
};
const base = new URL(args.find((x) => !x.startsWith('--')) ?? 'http://localhost:8080');
const lagMs = flag('lag', 0);
const seconds = flag('seconds', 15);
const modeArg = args.find((x) => x.startsWith('--mode='))?.slice(7) ?? 'team-deathmatch';
const mode: OnlineModeId = ONLINE_MODES.find((m) => m === modeArg) ?? 'team-deathmatch';

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const health = (await (await fetch(new URL('/healthz', base))).json()) as { ok: boolean; build: string };
check(health.ok === true, `health check (build ${health.build})`);
const page = await fetch(base);
check(page.ok && (await page.text()).includes('id="app"'), 'the page is served');

const map = createTestRange(1);
const terrain = buildTerrain(map);
const room = `smoke-${Math.floor(Math.random() * 1e6)}`;
const line = (): Transport => {
  const ws = new WebSocketTransport(gameServerUrl({ protocol: base.protocol, host: base.host }));
  return lagMs > 0 ? new LaggedTransport(ws, lagMs) : ws;
};
const pilot = { room, mode, map: 'test-range', environment: CALM_NOON, start: 'air' } as const;
const loadMap = async () => ({ map, terrain });
const a = await NetworkSession.connect(line(), { ...pilot, callsign: 'Smoke A', aircraftId: 'kestrel' }, loadMap);
const b = await NetworkSession.connect(line(), { ...pilot, callsign: 'Smoke B', aircraftId: 'kobchik' }, loadMap);
check(true, `two pilots joined room ${room} (${mode})`);

const weave = (t: number): ControlInput => ({ ...neutralInput(0.85), roll: 0.5 * Math.sin(t * 1.3), pitch: 0.25 + 0.25 * Math.sin(t * 0.7) });
const errors: number[] = [];
const depths: number[] = [];
let chatAt = -1;
const heard: number[] = [];
const start = performance.now();
let last = start;
await new Promise<void>((resolve) => {
  const timer = setInterval(() => {
    const now = performance.now();
    const t = (now - start) / 1000;
    a.update((now - last) / 1000, weave(t));
    b.update((now - last) / 1000, weave(t + 2));
    last = now;
    if (t > seconds / 2) {
      errors.push(a.predictionErrorM, b.predictionErrorM);
      depths.push(a.queueDepth, b.queueDepth);
    }
    if (chatAt < 0 && t > seconds / 2) {
      chatAt = t;
      a.sendChat(0);
    }
    for (const c of b.drainChat()) heard.push(c.index);
    a.drainChat();
    a.drainEvents();
    b.drainEvents();
    if (t >= seconds || a.closed || b.closed) {
      clearInterval(timer);
      resolve();
    }
  }, 1000 / 60);
});

check(!a.closed && !b.closed, 'both lines stayed open');
const humans = [...a.views()].filter((v) => !v.isBot);
check(humans.length === 2, `each pilot sees the other (${humans.map((v) => v.callsign).join(', ')})`);
const rttOk = a.rttMs >= 2 * lagMs - 5 && a.rttMs < 2 * lagMs + 250;
check(rttOk, `round trip ${a.rttMs.toFixed(0)} ms (lag ${lagMs} ms each way)`);
// A frame that starts late can leave the server one input short: it repeats the last one and the jet is corrected
// by one tick of flight (about 4 m). That may happen now and then, but not most of the time.
errors.sort((x, y) => x - y);
const p90 = errors[Math.floor(errors.length * 0.9)] ?? 0;
check(p90 < 0.5, `own jet prediction error: 90% of frames under ${p90.toFixed(3)} m (worst ${(errors.at(-1) ?? 0).toFixed(2)} m)`);
const meanDepth = depths.reduce((x, y) => x + y, 0) / Math.max(1, depths.length);
check(meanDepth > 0.5 && meanDepth < 5, `server input queue ${meanDepth.toFixed(1)} on average (aim 2, starved ${depths.filter((d) => d === 0).length} of ${depths.length})`);
check(heard.includes(0), 'quick chat arrived');
const status = a.modeStatus();
check(status.modeId === mode, `the room plays ${status.label}`);
if (mode === 'air-superiority') check((status.zones ?? []).length === 3, 'three zones on the status');
if (mode === 'team-objective') check([...a.views()].filter((v) => v.config.support).length === 4, 'four Sentinels in the sky');
if (mode === 'free-flight') check([...a.views()].every((v) => !v.isBot), 'no bots in Free Flight');

a.dispose();
b.dispose();
console.log(failures.length === 0 ? '\nSmoke test passed.' : `\nSmoke test FAILED: ${failures.length} check(s).`);
process.exit(failures.length === 0 ? 0 : 1);
