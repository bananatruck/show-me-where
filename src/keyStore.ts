const LEGACY_KEY = "claim-check.openrouter-key";

/**
 * Earlier versions could keep the OpenRouter key in session or local storage.
 * Storage is shared by every page on the same github.io origin, so the key is
 * now kept only in memory, and any copy an earlier version stored is removed.
 */
export function forgetStoredKeys(): void {
  for (const store of ["sessionStorage", "localStorage"] as const) {
    try {
      window[store].removeItem(LEGACY_KEY);
    } catch {
      // Storage can be blocked; then nothing was stored there either.
    }
  }
}
