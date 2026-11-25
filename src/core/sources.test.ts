import { describe, it, expect } from "vitest";
import type { FetchLike, SourceText } from "./types";
import { rebuildAbstract, openAlexWorkUrl, fetchSourceByDoi, lookupDoi } from "./sources";

describe("sources", () => {
  it("rebuildAbstract orders words by position", () => {
    expect(rebuildAbstract({ works: [2], Science: [0], really: [1] })).toBe(
      "Science really works",
    );
  });

  it("rebuildAbstract places a repeated word at every position", () => {
    expect(rebuildAbstract({ very: [2, 1], good: [3], A: [0] })).toBe(
      "A very very good",
    );
  });

  it("rebuildAbstract marks missing positions so a quote cannot span them", () => {
    expect(rebuildAbstract({ last: [9], first: [2], second: [3] })).toBe("[...] first second [...] last");
    expect(rebuildAbstract({ fasting: [2], raised: [3] })).toBe("[...] fasting raised");
    expect(rebuildAbstract({ Fasting: [0], raised: [1] })).toBe("Fasting raised");
  });

  it("rebuildAbstract returns empty string for empty index", () => {
    expect(rebuildAbstract({})).toBe("");
  });

  it("openAlexWorkUrl encodes the DOI and adds no contact parameter", () => {
    expect(openAlexWorkUrl("10.1234/a b?x=1&y=#z")).toBe(
      "https://api.openalex.org/works/doi:10.1234%2Fa%20b%3Fx%3D1%26y%3D%23z?select=id,doi,title,abstract_inverted_index",
    );
  });

  it("fetchSourceByDoi returns the rebuilt abstract", async () => {
    const calls: Parameters<FetchLike>[] = [];
    const fakeFetch: FetchLike = async (...args) => {
      calls.push(args);
      return new Response(
        JSON.stringify({ abstract_inverted_index: { works: [1], Science: [0] } }),
        { status: 200 },
      );
    };

    expect(await fetchSourceByDoi("10.1234/science", fakeFetch)).toEqual({
      status: "ok",
      text: "Science works",
      origin: "openalex",
    });
    expect(calls).toEqual([
      ["https://api.openalex.org/works/doi:10.1234%2Fscience?select=id,doi,title,abstract_inverted_index"],
    ]);
  });

  it.each([
    { The: [0], treatment: [1], significantly: [3], improved: [4], survival: [5], in: [6], adult: [7], "patients.": [8] },
    { Treatment: [1], improved: [2], survival: [3], in: [4], "adults.": [5] },
    { Treatment: [0], worsened: [1], improved: [1], survival: [2], in: [3], "adults.": [4] },
  ])("fetchSourceByDoi rejects an incomplete or conflicting abstract: %j", async (index) => {
    const fakeFetch: FetchLike = async () => new Response(JSON.stringify({ abstract_inverted_index: index }));
    expect(await fetchSourceByDoi("10.1234/incomplete", fakeFetch)).toMatchObject({ status: "unreachable" });
  });

  it("fetchSourceByDoi reports a missing DOI on 404", async () => {
    const fakeFetch: FetchLike = async () => new Response(null, { status: 404 });
    expect(await fetchSourceByDoi("10.1234/missing", fakeFetch)).toEqual({
      status: "unreachable",
      reason: "OpenAlex has no record for this DOI. Paste the source text instead.",
    });
  });

  it("fetchSourceByDoi reports other HTTP errors with the code", async () => {
    for (const status of [302, 429, 503]) {
      const fakeFetch: FetchLike = async () => new Response(null, { status });
      expect(await fetchSourceByDoi("10.1234/error", fakeFetch)).toEqual({
        status: "unreachable",
        reason: `OpenAlex answered HTTP ${status}. Paste the source text instead.`,
      });
    }
  });

  it("fetchSourceByDoi reports a null abstract as unreachable", async () => {
    for (const body of [
      { abstract_inverted_index: null },
      {},
      { abstract_inverted_index: {} },
      { abstract_inverted_index: { unused: [] } },
    ]) {
      const fakeFetch: FetchLike = async () =>
        new Response(JSON.stringify(body), { status: 200 });
      expect(await fetchSourceByDoi("10.1234/no-abstract", fakeFetch)).toEqual({
        status: "unreachable",
        reason: "OpenAlex has no abstract for this work. Paste the source text instead.",
      });
    }
  });

  it("fetchSourceByDoi reports a thrown fetch as unreachable", async () => {
    const fakeFetch: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await fetchSourceByDoi("10.1234/offline", fakeFetch)).toEqual({
      status: "unreachable",
      reason: "Could not reach OpenAlex. Paste the source text instead.",
    });
  });

  it("fetchSourceByDoi reports invalid JSON as unreachable", async () => {
    const fakeFetch: FetchLike = async () =>
      new Response("{invalid JSON", { status: 200 });
    expect(await fetchSourceByDoi("10.1234/unreadable", fakeFetch)).toEqual({
      status: "unreachable",
      reason: "OpenAlex sent a reply that could not be read. Paste the source text instead.",
    });
  });
});

describe("lookupDoi", () => {
  const fullText: SourceText = { status: "ok", text: "Full text.", origin: "europepmc" };
  const abstract: SourceText = { status: "ok", text: "Abstract.", origin: "openalex" };

  it("prefers open-access full text and does not ask for the abstract", async () => {
    const asked: string[] = [];
    const result = await lookupDoi("10.1/x", {
      fullText: async (doi) => (asked.push(`full ${doi}`), fullText),
      abstract: async (doi) => (asked.push(`abstract ${doi}`), abstract),
    });
    expect(result).toEqual(fullText);
    expect(asked).toEqual(["full 10.1/x"]);
  });

  it("falls back to the abstract when there is no full text", async () => {
    const result = await lookupDoi("10.1/x", {
      fullText: async () => ({ status: "unreachable", reason: "No full text." }),
      abstract: async () => abstract,
    });
    expect(result).toEqual(abstract);
  });

  it("gives both reasons when neither is available", async () => {
    const result = await lookupDoi("10.1/x", {
      fullText: async () => ({ status: "unreachable", reason: "Europe PMC has no open-access full text for this DOI." }),
      abstract: async () => ({ status: "unreachable", reason: "OpenAlex has no abstract for this work. Paste the source text instead." }),
    });
    expect(result).toEqual({
      status: "unreachable",
      reason:
        "Europe PMC has no open-access full text for this DOI. OpenAlex has no abstract for this work. Paste the source text instead.",
    });
  });
});
