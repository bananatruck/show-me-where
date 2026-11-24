const KEY = "claim-check.openrouter-key";

function storage(kind: "session" | "local"): Storage | null {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function read(store: Storage | null): string | null {
  try {
    return store?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

/** The stored key and whether it was remembered on this device. */
export function loadKey(): { key: string; remember: boolean } {
  const local = read(storage("local"));
  if (local !== null) return { key: local, remember: true };
  return { key: read(storage("session")) ?? "", remember: false };
}

/**
 * Keeps the key only in this browser: session storage by default, local
 * storage when the user asks to remember it. The other store is cleared.
 */
export function saveKey(key: string, remember: boolean): void {
  const keep = storage(remember ? "local" : "session");
  const drop = storage(remember ? "session" : "local");
  try {
    drop?.removeItem(KEY);
    if (key === "") keep?.removeItem(KEY);
    else keep?.setItem(KEY, key);
  } catch {
    // Storage can be blocked; the key then lives only in memory for this page.
  }
}
