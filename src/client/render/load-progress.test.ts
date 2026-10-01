import { describe, expect, it } from 'vitest';
import { LoadProgress } from './load-progress.ts';

describe('LoadProgress', () => {
  it('counts work as it is added and as it settles, failures included', async () => {
    const p = new LoadProgress();
    const seen: string[] = [];
    p.subscribe((x) => seen.push(`${x.done}/${x.total}`));
    expect(p.fraction).toBe(1);
    let resolve: (v: number) => void = () => {};
    const a = p.track(new Promise<number>((r) => (resolve = r)));
    const b = p.track(Promise.reject(new Error('missing'))).catch(() => 'failed');
    expect(p.complete).toBe(false);
    expect(await b).toBe('failed');
    expect(p.fraction).toBe(0.5);
    resolve(7);
    expect(await a).toBe(7);
    expect(p.complete).toBe(true);
    expect(seen).toEqual(['0/0', '0/1', '0/2', '1/2', '2/2']);
  });
});
