import { describe, expect, it } from "vitest";
import { SAMPLE_RUN } from "../fixtures/sample";
import { REASONS } from "./grading";
import { analyzeText, resolveSources, runCheck } from "./pipeline";
import { ProviderError, createReplayProvider, type ModelProvider } from "./provider";
import type { SourceText } from "./types";

function sampleSources(): Record<number, SourceText> {
  const out: Record<number, SourceText> = {
    5: { status: "unreachable", reason: "No source text in the sample." },
  };
  for (const [n, text] of Object.entries(SAMPLE_RUN.sources)) {
    out[Number(n)] = { status: "ok", text, origin: "fixture" };
  }
  return out;
}

describe("analyzeText", () => {
  it("finds claims, uncited sentences and references; a marker with no reference is not a citation", () => {
    const analysis = analyzeText(
      "A holds [1]. B holds [2]. C is plain.\nReferences\n[1] X. doi:10.1000/x",
    );
    expect(analysis.claims.map((c) => [c.id, c.refs])).toEqual([["c1", [1]]]);
    expect(analysis.uncited).toEqual(["B holds [2].", "C is plain."]);
    expect(analysis.style).toBe("numeric");
    expect(analysis.references).toEqual([
      { number: 1, raw: "X. doi:10.1000/x", doi: "10.1000/x", label: "[1]", authors: [], year: null },
    ]);
  });
});

describe("resolveSources", () => {
  it("prefers pasted text, then DOI lookup, and fetches each cited reference once", async () => {
    const analysis = analyzeText(
      [
        "A [1]. B [1, 2]. C [3].",
        "References",
        "[1] One. doi:10.1000/one",
        "[2] Two. doi:10.1000/two",
        "[3] Three, no DOI.",
        "[4] Four, never cited. doi:10.1000/four",
      ].join("\n"),
    );
    const looked: string[] = [];
    const sources = await resolveSources(analysis, { 2: "  pasted two  " }, async (doi) => {
      looked.push(doi);
      return { status: "ok", text: `abstract of ${doi}`, origin: "openalex" };
    });
    expect(looked).toEqual(["10.1000/one"]);
    expect(sources).toEqual({
      1: { status: "ok", text: "abstract of 10.1000/one", origin: "openalex" },
      2: { status: "ok", text: "pasted two", origin: "pasted" },
      3: {
        status: "unreachable",
        reason: "No DOI found in this reference. Paste the source text instead.",
      },
    });
  });
});

describe("runCheck", () => {
  it("sends the scope of each citation and a fenced source to the model", async () => {
    const analysis = analyzeText(
      "Memory scores rose sharply [1], while reaction times did not change at all [2].\nReferences\n[1] A.\n[2] B.",
    );
    const users: string[] = [];
    const provider: ModelProvider = {
      label: "spy",
      async complete(request) {
        users.push(request.user);
        return JSON.stringify({ grade: "cannot_tell", evidence: "", reason: "r" });
      },
    };
    await runCheck(
      analysis,
      {
        1: { status: "ok", text: "Source one.", origin: "pasted" },
        2: { status: "ok", text: "Source two.", origin: "pasted" },
      },
      provider,
    );
    expect(users[0]).toMatch(/PART CITED TO THIS SOURCE[^\n]*\n<student-[0-9a-f]{12}>\nMemory scores rose sharply\n/);
    expect(users[1]).toMatch(
      /PART CITED TO THIS SOURCE[^\n]*\n<student-[0-9a-f]{12}>\nwhile reaction times did not change at all\n/,
    );
    expect(users[1]).toMatch(/<source-[0-9a-f]{12}>\nSource two.\n<\/source-[0-9a-f]{12}>/);
  });

  it("grades the synthetic sample, including one discarded grade", async () => {
    const analysis = analyzeText(SAMPLE_RUN.text);
    const report = await runCheck(analysis, sampleSources(), createReplayProvider(SAMPLE_RUN.replies));

    expect(analysis.uncited).toEqual(["Many students say they sleep less during exam weeks."]);
    expect(analysis.style).toBe("author_year");
    expect(report.results.map((r) => [r.claim.id, r.claim.refs, r.headline])).toEqual([
      ["c1", [1], "supported"],
      ["c2", [1], "partly_supported"],
      ["c3", [2], "cannot_tell"],
      ["c4", [3, 4], "sources_disagree"],
      ["c5", [3], "cannot_tell"],
      ["c6", [5], "source_not_reachable"],
    ]);
    expect(report.results[1]?.perSource[0]?.judgement.warnings).toEqual([
      "The claim says 18%, which is not in the quoted sentence.",
    ]);
    const discarded = report.results[2]?.perSource[0]?.judgement;
    expect(discarded?.reason).toBe(REASONS.quoteNotFound);
    expect(discarded?.discarded?.grade).toBe("supported");
    for (const result of report.results) {
      for (const { judgement } of result.perSource) {
        if (judgement.grade !== "cannot_tell" && judgement.grade !== "source_not_reachable") {
          expect(judgement.evidence).not.toBeNull();
        }
      }
    }
  });

  it("does not call the model for an unreachable source", async () => {
    const analysis = analyzeText("A [1].\nReferences\n[1] X.");
    const calls: string[] = [];
    const provider: ModelProvider = {
      label: "spy",
      async complete(request) {
        calls.push(request.key);
        return "";
      },
    };
    const report = await runCheck(
      analysis,
      { 1: { status: "unreachable", reason: "No DOI." } },
      provider,
    );
    expect(calls).toEqual([]);
    expect(report.results[0]?.headline).toBe("source_not_reachable");
    expect(report.results[0]?.perSource[0]?.judgement.reason).toBe("No DOI.");
  });

  it("records a failed model call as check_failed and keeps going", async () => {
    const analysis = analyzeText("A [1]. B [1].\nReferences\n[1] X.");
    let n = 0;
    const provider: ModelProvider = {
      label: "flaky",
      async complete() {
        n += 1;
        if (n === 1) throw new ProviderError("rate_limit", "Slow down.");
        return JSON.stringify({ grade: "cannot_tell", evidence: "", reason: "Not covered." });
      },
    };
    const report = await runCheck(
      analysis,
      { 1: { status: "ok", text: "Some source text here.", origin: "pasted" } },
      provider,
    );
    expect(report.results.map((r) => r.perSource[0]?.judgement.grade)).toEqual([
      "check_failed",
      "cannot_tell",
    ]);
    expect(report.results.map((r) => r.perSource[0]?.judgement.reason)).toEqual([
      "The model call failed: Slow down.",
      "Not covered.",
    ]);
  });

  it("stops the run when the key is rejected", async () => {
    const analysis = analyzeText("A [1].\nReferences\n[1] X.");
    const provider: ModelProvider = {
      label: "bad key",
      async complete() {
        throw new ProviderError("auth", "OpenRouter rejected the key (HTTP 401)");
      },
    };
    await expect(
      runCheck(analysis, { 1: { status: "ok", text: "Text.", origin: "pasted" } }, provider),
    ).rejects.toMatchObject({ kind: "auth" });
  });
});
