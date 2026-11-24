import type { FetchLike } from "./types";

/**
 * Wraps a fetch so every request is aborted after `ms` milliseconds, or
 * earlier if the caller's own signal aborts. A slow
 * source service then fails like an unreachable one, and the lookup moves on
 * to the next source instead of leaving the page waiting forever.
 */
export function withTimeout(fetchImpl: FetchLike, ms: number): FetchLike {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    // Keep the caller's own signal too, so a superseded run can cancel its request.
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetchImpl(input, { ...init, signal });
  };
}
