const PREFIX = 'contested-skies:';

/** Per-browser convenience settings. Storage may be unavailable (private mode, blocked): always fall back. */
export function loadSetting<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    return raw === null || raw === undefined ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveSetting(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable: settings simply won't persist.
  }
}
