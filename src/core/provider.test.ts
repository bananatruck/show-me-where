import { describe, expect, it } from "vitest";
import completion from "../fixtures/openrouter/completion.synthetic.json";
import unauthorized from "../fixtures/openrouter/unauthorized.recorded.json";
import {
  OPENROUTER_CHAT_URL,
  ProviderError,
  createOpenRouterProvider,
  createReplayProvider,
} from "./provider";
import type { FetchLike } from "./types";

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** A fetch that replays one stored HTTP exchange and records what was sent. */
function replayFetch(status: number, body: unknown): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch, calls };
}

const REQUEST = { key: "c1:1", system: "rubric", user: "claim and source" };

describe("createOpenRouterProvider", () => {
  it("sends the documented chat completions request", async () => {
    const { fetch, calls } = replayFetch(completion.status, completion.body);
    const provider = createOpenRouterProvider({
      apiKey: "test-key",
      model: "google/gemma-4-31b-it:free",
      fetchImpl: fetch,
    });
    await provider.complete(REQUEST);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe(OPENROUTER_CHAT_URL);
    expect(OPENROUTER_CHAT_URL).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(call?.init?.method).toBe("POST");
    expect(call?.init?.headers).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      model: "google/gemma-4-31b-it:free",
      messages: [
        { role: "system", content: "rubric" },
        { role: "user", content: "claim and source" },
      ],
      temperature: 0,
    });
  });

  it("returns choices[0].message.content from the reply", async () => {
    const { fetch } = replayFetch(completion.status, completion.body);
    const provider = createOpenRouterProvider({
      apiKey: "k",
      model: "google/gemma-4-31b-it:free",
      fetchImpl: fetch,
    });
    expect(await provider.complete(REQUEST)).toBe(
      completion.body.choices[0]?.message.content,
    );
  });

  it("refuses a model id that does not end in :free", () => {
    expect(() =>
      createOpenRouterProvider({ apiKey: "k", model: "vendor/paid-model", fetchImpl: fetch }),
    ).toThrow(/:free/);
  });

  it("refuses an empty key", () => {
    expect(() =>
      createOpenRouterProvider({ apiKey: " ", model: "a/b:free", fetchImpl: fetch }),
    ).toThrow(/key/);
  });

  it("turns the recorded 401 reply into an auth error with the provider's message", async () => {
    const { fetch } = replayFetch(unauthorized.status, unauthorized.body);
    const provider = createOpenRouterProvider({ apiKey: "k", model: "a/b:free", fetchImpl: fetch });
    const error = await provider.complete(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({
      kind: "auth",
      message: "OpenRouter rejected the key (HTTP 401): No cookie auth credentials found",
    });
  });

  it("reports HTTP 429 as a rate limit", async () => {
    const { fetch } = replayFetch(429, { error: { message: "Rate limit exceeded", code: 429 } });
    const provider = createOpenRouterProvider({ apiKey: "k", model: "a/b:free", fetchImpl: fetch });
    await expect(provider.complete(REQUEST)).rejects.toMatchObject({ kind: "rate_limit" });
  });

  it("reports other HTTP errors with their status", async () => {
    const { fetch } = replayFetch(502, { error: { message: "Upstream down", code: 502 } });
    const provider = createOpenRouterProvider({ apiKey: "k", model: "a/b:free", fetchImpl: fetch });
    await expect(provider.complete(REQUEST)).rejects.toMatchObject({
      kind: "http",
      message: "OpenRouter answered HTTP 502: Upstream down",
    });
  });

  it("reports a thrown fetch as a network error", async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    const provider = createOpenRouterProvider({ apiKey: "k", model: "a/b:free", fetchImpl: fetch });
    await expect(provider.complete(REQUEST)).rejects.toMatchObject({ kind: "network" });
  });

  it("reports a reply without message content as a bad response", async () => {
    const { fetch } = replayFetch(200, { choices: [{ error: { message: "x", code: 500 } }] });
    const provider = createOpenRouterProvider({ apiKey: "k", model: "a/b:free", fetchImpl: fetch });
    await expect(provider.complete(REQUEST)).rejects.toMatchObject({ kind: "bad_response" });
  });
});

describe("createReplayProvider", () => {
  it("returns the stored reply for the request key", async () => {
    const provider = createReplayProvider({ "c1:1": "stored" });
    expect(await provider.complete(REQUEST)).toBe("stored");
  });

  it("fails clearly when no reply was stored for a key", async () => {
    const provider = createReplayProvider({});
    await expect(provider.complete(REQUEST)).rejects.toMatchObject({ kind: "bad_response" });
  });
});
