/**
 * The balance tournament (spec §9.4): every USA jet against every Russian jet, Ace bots from a neutral head-on start,
 * 100 seeds per pairing, spread over worker threads. Prints the table and exits non-zero when a pairing's win rate is
 * outside 35–65%.
 *
 *   node tools/tournament.ts [--seeds=100] [--first=1] [--only=condor,yastreb]
 */
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { allPairings, formatTournament, isBalanced, type PairingResult, runPairing, SEEDS_PER_PAIRING, seedRange, usaWinRate } from '../src/shared/ai/tournament.ts';
import { buildTerrain } from '../src/shared/data/maps/map-definition.ts';
import { createTestRange } from '../src/shared/data/maps/test-range.ts';

interface Job {
  pairs: [string, string][];
  seeds: number[];
}

if (!isMainThread) {
  const job = workerData as Job;
  const map = createTestRange(1);
  const terrain = buildTerrain(map);
  for (const [usa, russia] of job.pairs) parentPort?.postMessage(runPairing(map, terrain, usa, russia, job.seeds));
} else {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const seeds = seedRange(Number(flag('seeds') ?? SEEDS_PER_PAIRING), Number(flag('first') ?? 1));
  const only = flag('only')?.split(',');
  const pairs = allPairings().filter(([u, r]) => !only || only.includes(u) || only.includes(r));
  const threads = Math.max(1, Math.min(availableParallelism(), pairs.length));
  const started = performance.now();
  const results: PairingResult[] = [];
  await Promise.all(
    Array.from({ length: threads }, (_, t) => {
      const job: Job = { pairs: pairs.filter((_, i) => i % threads === t), seeds };
      return new Promise<void>((resolve, reject) => {
        const w = new Worker(new URL(import.meta.url), { workerData: job });
        w.on('message', (r: PairingResult) => {
          results.push(r);
          process.stderr.write(`${r.usa} vs ${r.russia}: ${Math.round(usaWinRate(r) * 100)}% (${r.usaWins}-${r.russiaWins}-${r.draws})\n`);
        });
        w.on('error', reject);
        w.on('exit', () => resolve());
      });
    }),
  );
  results.sort((a, b) => pairs.findIndex(([u, r]) => u === a.usa && r === a.russia) - pairs.findIndex(([u, r]) => u === b.usa && r === b.russia));
  console.log(`\n${formatTournament(results)}\n`);
  const off = results.filter((r) => !isBalanced(r));
  const draws = results.reduce((n, r) => n + r.draws, 0);
  console.log(`${results.length} pairings x ${seeds.length} seeds in ${((performance.now() - started) / 1000).toFixed(0)} s; ${draws} draws; ${off.length} outside 35-65%.`);
  process.exit(off.length === 0 ? 0 : 1);
}
