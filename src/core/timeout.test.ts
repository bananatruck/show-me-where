import { describe, expect, it } from "vitest";
import { anySignal, withSignal, withTimeout } from "./timeout";
import type { FetchLike } from "./types";

/** A fetch that never answers, and rejects only when its signal aborts, like a browser fetch. */
const hangingFetch: FetchLike = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

describe("withTimeout", () => {
  it("rejects a request that takes longer than the limit", async () => {
    await expect(withTimeout(hangingFetch, 20)("https://example.org")).rejects.toThrow();
  });

  it("passes the request and its options through and returns the answer", async () => {
    const seen: (RequestInit | undefined)[] = [];
    const fetch: FetchLike = async (_input, init) => {
      seen.push(init);
      return new Response("ok");
    };
    const response = await withTimeout(fetch, 1000)("https://example.org", { method: "POST" });
    expect(await response.text()).toBe("ok");
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("also aborts when the caller's own signal aborts", async () => {
    const controller = new AbortController();
    const pending = withTimeout(hangingFetch, 10_000)("https://example.org", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("withTimeout around withSignal, as the app composes them", () => {
  it("is aborted by the timeout when the run is still current", async () => {
    const run = new AbortController();
    await expect(withTimeout(withSignal(hangingFetch, run.signal), 20)("https://example.org")).rejects.toThrow();
    expect(run.signal.aborted).toBe(false);
  });

  it("is aborted by the run's cancel signal before the timeout", async () => {
    const run = new AbortController();
    const pending = withTimeout(withSignal(hangingFetch, run.signal), 10_000)("https://example.org");
    run.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("anySignal", () => {
  it("aborts when any input aborts, also without AbortSignal.any", () => {
    const a = new AbortController();
    const b = new AbortController();
    const native = AbortSignal.any;
    try {
      // Exercise the fallback path used by browsers that lack AbortSignal.any.
      (AbortSignal as { any?: unknown }).any = undefined;
      const combined = anySignal([a.signal, b.signal]);
      expect(combined.aborted).toBe(false);
      b.abort();
      expect(combined.aborted).toBe(true);
    } finally {
      (AbortSignal as { any?: unknown }).any = native;
    }
  });

  it("is already aborted when an input already is", () => {
    const a = new AbortController();
    a.abort();
    expect(anySignal([a.signal, new AbortController().signal]).aborted).toBe(true);
  });
});
