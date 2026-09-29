import { describe, expect, it } from 'vitest';
import { findExternalAssetRefs, inlineAssets } from './inline-assets.ts';

describe('findExternalAssetRefs', () => {
  it('finds build-asset references left in markup or code', () => {
    const html =
      '<img src="/assets/a-1.jpg"><script type="module">const s = "./assets/sky-9.jpg"; f(`/assets/x.png`);</script>';
    expect(findExternalAssetRefs(html)).toEqual(['/assets/a-1.jpg', './assets/sky-9.jpg', '/assets/x.png']);
  });
  it('ignores data URIs and unrelated paths', () => {
    expect(findExternalAssetRefs('<link rel="icon" href="data:image/svg+xml,%3Csvg%3E"><a href="/about">x</a>')).toEqual([]);
  });
});

const page = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const assets = (files: Record<string, string>) => (href: string) => {
  const content = files[href];
  if (content === undefined) throw new Error(`ENOENT: ${href}`);
  return content;
};

describe('inlineAssets', () => {
  it('inlines a stylesheet link as a style tag', () => {
    const html = page('<link rel="stylesheet" crossorigin href="/assets/app.css">');
    expect(inlineAssets(html, assets({ '/assets/app.css': 'body{margin:0}' }))).toBe(page('<style>body{margin:0}</style>'));
  });

  it('inlines a module script and drops src/crossorigin', () => {
    const html = page('<script type="module" crossorigin src="/assets/app.js"></script>');
    expect(inlineAssets(html, assets({ '/assets/app.js': 'console.log(1);' }))).toBe(
      page('<script type="module">console.log(1);</script>'),
    );
  });

  it('escapes closing tags inside inlined code so the page cannot be cut short', () => {
    const html = page('<link rel="stylesheet" href="/a.css"><script type="module" src="/a.js"></script>');
    const out = inlineAssets(html, assets({ '/a.css': 'a::after{content:"</style>"}', '/a.js': 'x("</script>");y("</SCRIPT >")' }));
    expect(out).toContain('x("<\\/script>");y("<\\/SCRIPT >")');
    expect(out).toContain('content:"<\\/style>"');
    expect(out.match(/<\/script>/g)).toHaveLength(1);
  });

  it('inserts asset content literally, without $-pattern substitution', () => {
    const html = page('<script type="module" src="/a.js"></script>');
    expect(inlineAssets(html, assets({ '/a.js': "s.replace(/x/, '$&$1$$')" }))).toContain("s.replace(/x/, '$&$1$$')");
  });

  it('leaves other links and inline scripts alone and removes modulepreload hints', () => {
    const head =
      '<meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg%3E"><link rel="modulepreload" href="/b.js"><script>var inline = 1;</script>';
    const out = inlineAssets(page(head), assets({}));
    expect(out).toBe(page('<meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg%3E"><script>var inline = 1;</script>'));
  });

  it('fails with the asset path when an asset cannot be read', () => {
    const html = page('<script type="module" src="/missing.js"></script>');
    expect(() => inlineAssets(html, assets({}))).toThrow('Cannot inline /missing.js: ENOENT: /missing.js');
  });
});
