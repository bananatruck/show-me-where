import type { FetchLike } from "./types";

/**
 * A signal that aborts as soon as any of the given signals aborts. Uses
 * AbortSignal.any where the browser has it, and a small listener-based
 * fallback where it does not.
 */
export function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([...signals]);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/** The request's own signal, if any, combined with another one; neither replaces the other. */
function combined(init: RequestInit | undefined, signal: AbortSignal): AbortSignal {
  return init?.signal ? anySignal([init.signal, signal]) : signal;
}

/**
 * Wraps a fetch so every request is aborted after `ms` milliseconds, or
 * earlier if the caller's own signal aborts. A slow source service then fails
 * like an unreachable one, and the lookup moves on to the next source instead
 * of leaving the page waiting forever.
 */
export function withTimeout(fetchImpl: FetchLike, ms: number): FetchLike {
  return (input, init) =>
    fetchImpl(input, { ...init, signal: combined(init, AbortSignal.timeout(ms)) });
}

/**
 * Wraps a fetch so every request is also aborted when `signal` aborts, for
 * example when a check is superseded, while any signal the request already
 * carries (such as a timeout) keeps working.
 */
export function withSignal(fetchImpl: FetchLike, signal: AbortSignal): FetchLike {
  return (input, init) => fetchImpl(input, { ...init, signal: combined(init, signal) });
}
