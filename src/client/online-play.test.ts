import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorReport, isOutdated, MAX_ERROR_REPORTS, reportErrors } from './online-play.ts';

describe('online play helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for a reload only when two real builds differ', () => {
    expect(isOutdated('0.1.0-202610011200', '0.1.0-202610021200')).toBe(true);
    expect(isOutdated('0.1.0-202610011200', '0.1.0-202610011200')).toBe(false);
    expect(isOutdated('dev', '0.1.0-202610021200')).toBe(false);
    expect(isOutdated('0.1.0-202610011200', 'dev')).toBe(false);
  });

  it('reports uncaught errors to the server, a few per page and only until stopped', () => {
    const page = new EventTarget();
    vi.stubGlobal('window', page);
    const sent: string[] = [];
    const stop = reportErrors('0.1.0-test', (body) => sent.push(body));
    page.dispatchEvent(Object.assign(new Event('error'), { error: new TypeError('boom') }));
    page.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'no route' }));
    expect(sent).toHaveLength(2);
    const first = JSON.parse(sent[0]) as { build: string; error: string };
    expect(first.build).toBe('0.1.0-test');
    expect(first.error).toContain('TypeError: boom');
    expect(JSON.parse(sent[1])).toEqual({ build: '0.1.0-test', error: 'no route' });
    for (let i = 0; i < 10; i++) page.dispatchEvent(Object.assign(new Event('error'), { error: new Error(`e${i}`) }));
    expect(sent).toHaveLength(MAX_ERROR_REPORTS);
    stop();
    expect(errorReport(new Error('x'.repeat(5000)), 'b').length).toBeLessThan(1600);
  });
});
