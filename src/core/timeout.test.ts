import { describe, expect, it } from "vitest";
import { withTimeout } from "./timeout";
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
});
