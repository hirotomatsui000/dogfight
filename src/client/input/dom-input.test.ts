import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomInput } from './dom-input.ts';

describe('DomInput.requestPointerLock', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('handles a refused pointer lock without an unhandled rejection and reports it', async () => {
    vi.stubGlobal('document', { pointerLockElement: null });
    const target = { requestPointerLock: () => Promise.reject(new Error('WrongDocumentError')) } as unknown as HTMLElement;
    const input = new DomInput(target);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    input.requestPointerLock();
    await new Promise((r) => setTimeout(r, 0));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Mouse capture unavailable'), 'WrongDocumentError');
    expect(input.pointerLockRefused).toBe(true);
  });

  it('works with browsers whose requestPointerLock returns nothing', () => {
    vi.stubGlobal('document', { pointerLockElement: null });
    const target = { requestPointerLock: () => undefined } as unknown as HTMLElement;
    expect(() => new DomInput(target).requestPointerLock()).not.toThrow();
  });
});
