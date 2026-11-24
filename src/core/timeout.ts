import type { FetchLike } from "./types";

/**
 * Wraps a fetch so every request is aborted after `ms` milliseconds. A slow
 * source service then fails like an unreachable one, and the lookup moves on
 * to the next source instead of leaving the page waiting forever.
 */
export function withTimeout(fetchImpl: FetchLike, ms: number): FetchLike {
  return (input, init) => fetchImpl(input, { ...init, signal: AbortSignal.timeout(ms) });
}
