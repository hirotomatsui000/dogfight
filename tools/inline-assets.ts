/** Reads a built asset by the href/src exactly as it appears in the HTML (e.g. "/assets/index-abc.js"). */
export type ReadAsset = (href: string) => string;

const attribute = (tag: string, name: string): string | null =>
  new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1] ?? null;

/** `</script` inside inlined code would end the tag early; `<\/script` is equivalent inside JS strings and regexes. */
const escapeClosingTag = (content: string, tag: 'script' | 'style') =>
  content.replace(new RegExp(`</(${tag})`, 'gi'), '<\\/$1');

function read(readAsset: ReadAsset, href: string): string {
  try {
    return readAsset(href);
  } catch (err) {
    throw new Error(`Cannot inline ${href}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Turns a built page into a single self-contained file: stylesheet links become <style> tags,
 * external module scripts become inline module scripts, and modulepreload hints are dropped.
 * Everything else (meta tags, icons, inline scripts) is left untouched.
 */
export function inlineAssets(html: string, readAsset: ReadAsset): string {
  const withStyles = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = attribute(tag, 'rel');
    const href = attribute(tag, 'href');
    if (rel === 'modulepreload') return '';
    if (rel !== 'stylesheet' || !href) return tag;
    return `<style>${escapeClosingTag(read(readAsset, href), 'style')}</style>`;
  });
  return withStyles.replace(/<script\b([^>]*)><\/script>/gi, (tag, attrs: string) => {
    const src = attribute(attrs, 'src');
    if (!src) return tag;
    const type = attribute(attrs, 'type');
    return `<script${type ? ` type="${type}"` : ''}>${escapeClosingTag(read(readAsset, src), 'script')}</script>`;
  });
}
