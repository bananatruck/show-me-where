// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { judgeReply } from "./grading";
import { checkEvidence } from "./evidence";
import type { FetchLike, SourceText } from "./types";
import {
  europePmcSearchUrl,
  europePmcFullTextUrl,
  extractJatsText,
  fetchFullTextByDoi,
  MAX_FULL_TEXT_CHARS,
} from "./europepmc";

const searchReply = () => new Response(JSON.stringify({
  resultList: { result: [{ isOpenAccess: "Y", pmcid: "PMC123" }] },
}));

describe("europepmc", () => {
  it("europePmcSearchUrl quotes and encodes the DOI", () => {
    expect(europePmcSearchUrl("10.1234/a b?x=1&y=#z")).toBe(
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI%3A%2210.1234%2Fa%20b%3Fx%3D1%26y%3D%23z%22&format=json&resultType=lite",
    );
  });

  it("europePmcFullTextUrl builds the full text URL", () => {
    expect(europePmcFullTextUrl("PMC12/3 ?")).toBe(
      "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12%2F3%20%3F/fullTextXML",
    );
  });

  it("extractJatsText reads abstract then body paragraphs", () => {
    const xml = `<article><front><article-meta><title-group><p>Ignore</p></title-group>
      <abstract><title>Summary</title><p> First <italic>abstract</italic>\n paragraph. </p>
      <p> \t </p><sec><p>Second abstract.</p></sec></abstract>
      <abstract><p>Other abstract.</p></abstract></article-meta></front>
      <body><sec><title>T</title><p>Body &amp; results.</p><sec><p> Last\t paragraph. </p></sec></sec></body></article>`;
    expect(extractJatsText(xml)).toBe(
      "First abstract paragraph.\n\nSecond abstract.\n\nOther abstract.\n\nBody & results.\n\nLast paragraph.",
    );
  });

  it("extractJatsText skips references, tables, figures and back matter", () => {
    const xml = `<article><front><article-meta><abstract><p>Abstract.</p>
      <fig><p>Hidden abstract figure.</p></fig></abstract></article-meta></front>
      <body><p>Body.</p><ref-list><ref><p>Reference.</p></ref></ref-list>
      <table-wrap><table><tr><td><p>Table.</p></td></tr></table></table-wrap>
      <fig><caption><p>Figure.</p></caption></fig>
      <supplementary-material><p>Supplement.</p></supplementary-material>
      <back><p>Nested back.</p></back><p>End.</p></body>
      <back><p>Back.</p><ref-list><ref><p>Reference.</p></ref></ref-list></back></article>`;
    expect(extractJatsText(xml)).toBe("Abstract.\n\nBody.\n\nEnd.");
  });

  it("extractJatsText drops a figure, table or reference nested inside a paragraph", () => {
    const xml =
      "<article><body><p>Main result. <fig><caption><p>Caption-only claim.</p></caption></fig> End.</p>" +
      "<p>Second. <table-wrap><p>Cell text.</p></table-wrap><xref>[2]</xref> Done.</p></body></article>";
    expect(extractJatsText(xml)).toBe("Main result. End.\n\nSecond. [2] Done.");
  });

  it("extractJatsText turns a reference number glued to a full stop into a spaced marker", () => {
    const xml =
      '<article><body><p>Sleep latency fell by 15 minutes.<xref ref-type="bibr" rid="B1">1</xref> Total sleep time also rose.</p></body></article>';
    expect(extractJatsText(xml)).toBe("Sleep latency fell by 15 minutes. [1] Total sleep time also rose.");
  });

  it("preserves scientific superscripts and subscripts before checking evidence", () => {
    const xml = "<article><body><p>The concentration was 10<sup><italic>6</italic></sup> cells/mL.</p>" +
      "<p>The solution contained H<sub>2</sub>O and measured m<sup>2</sup>.</p></body></article>";
    const text = extractJatsText(xml);
    const quote = "The concentration was 10^(6) cells/mL.";
    expect(text).toBe(`${quote}\n\nThe solution contained H_(2)O and measured m^(2).`);
    expect(checkEvidence(quote, text)).toMatchObject({ ok: true });
    expect(checkEvidence("The concentration was 106 cells/mL.", text)).toEqual({ ok: false, reason: "not_found" });
    expect(judgeReply(JSON.stringify({
      grade: "supported", evidence: "The concentration was 106 cells/mL.", reason: "Same concentration.",
    }), text, "The concentration was 106 cells/mL.")).toMatchObject({ grade: "cannot_tell" });
  });

  it("keeps superscript bibliography references as spaced citation markers", () => {
    for (const [citation, marker] of [
      ['<sup><xref ref-type="bibr">1</xref></sup>', "[1]"],
      ['<xref ref-type="bibr"><sup>1</sup></xref>', "[1]"],
      ['<sup><xref ref-type="bibr">1</xref>, <xref ref-type="bibr">2</xref></sup>', "[1, 2]"],
      ['<sup><xref ref-type="bibr">1</xref>–<xref ref-type="bibr">3</xref></sup>', "[1–3]"],
      ['<sup><xref ref-type="bibr">1</xref>-<xref ref-type="bibr">3</xref></sup>', "[1-3]"],
      ['<sup><xref ref-type="bibr">1</xref>, <xref ref-type="bibr">4</xref>–<xref ref-type="bibr">6</xref></sup>', "[1, 4–6]"],
      ['<sup><xref ref-type="bibr">1</xref>; <xref ref-type="bibr">2</xref></sup>', "[1, 2]"],
      ['<sup><xref ref-type="bibr">1</xref><xref ref-type="bibr">2</xref></sup>', "[1, 2]"],
    ]) {
      const text = extractJatsText(`<article><body><p>Treatment improved survival in adults.${citation} Mortality also fell.</p></body></article>`);
      expect(text).not.toContain("^(");
      expect(text).toBe(`Treatment improved survival in adults. ${marker} Mortality also fell.`);
      expect(checkEvidence("Treatment improved survival in adults.", text)).toMatchObject({ ok: true });
    }
  });

  it("extractJatsText reads a paragraph nested in a list once", () => {
    const xml =
      "<article><body><p>Outer text.<list><list-item><p>Inner item.</p></list-item></list></p></body></article>";
    expect(extractJatsText(xml)).toBe("Outer text.\n\nInner item.");
  });

  it("extractJatsText keeps a space after a nested list before the parent text goes on", () => {
    const xml =
      "<article><body><p>Outer.<list><list-item><p>Inner treatment improved survival.</p></list-item></list>Following sentence.</p></body></article>";
    expect(extractJatsText(xml)).toBe("Outer.\n\nInner treatment improved survival.\n\nFollowing sentence.");
  });

  it("extractJatsText keeps a nested paragraph as its own paragraph, so a quote of it is a whole sentence", () => {
    const xml = "<article><body><p>Results:<p>Treatment improved survival in adults.</p></p></body></article>";
    const text = extractJatsText(xml);
    expect(text).toBe("Results:\n\nTreatment improved survival in adults.");
    expect(checkEvidence("Treatment improved survival in adults.", text)).toMatchObject({ ok: true, before: "Results:" });
  });

  it("extractJatsText returns empty string for invalid XML", () => {
    expect(extractJatsText("<article><body><p>Broken</body></article>")).toBe("");
  });

  it("fetchFullTextByDoi returns open-access full text", async () => {
    const fetchImpl = vi.fn<FetchLike>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ resultList: { result: [
        { isOpenAccess: "N", pmcid: "PMCclosed" },
        { isOpenAccess: "Y", pmcid: 123 },
        { isOpenAccess: "Y", pmcid: "PMC123" },
        { isOpenAccess: "Y", pmcid: "PMC456" },
      ] } })))
      .mockResolvedValueOnce(new Response("<article><body><p>Full text.</p></body></article>"));
    const parse = vi.fn((xml: string) => new DOMParser().parseFromString(xml, "application/xml"));
    expect(await fetchFullTextByDoi("10.1234/test", fetchImpl, parse)).toEqual({
      status: "ok", text: "Full text.", origin: "europepmc",
    });
    expect(fetchImpl.mock.calls).toEqual([
      ["https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI%3A%2210.1234%2Ftest%22&format=json&resultType=lite"],
      ["https://www.ebi.ac.uk/europepmc/webservices/rest/PMC123/fullTextXML"],
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(parse).toHaveBeenCalledOnce();

    for (const xml of ["<article/>", "<article><body><p> </p></body></article>", "<broken>"]) {
      const emptyFetch = vi.fn<FetchLike>()
        .mockResolvedValueOnce(searchReply())
        .mockResolvedValueOnce(new Response(xml));
      expect(await fetchFullTextByDoi("10.1234/empty", emptyFetch)).toEqual({
        status: "unreachable", reason: "Europe PMC full text could not be read.",
      });
    }
  });

  it("fetchFullTextByDoi reports no open-access copy without fetching full text", async () => {
    for (const result of [[], [{ isOpenAccess: "N", pmcid: "PMCclosed" }],
      [null, {}, { isOpenAccess: "Y" }, { isOpenAccess: "Y", pmcid: 1 }]]) {
      const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
        new Response(JSON.stringify({ resultList: { result } })),
      );
      expect(await fetchFullTextByDoi("10.1234/closed", fetchImpl)).toEqual({
        status: "unreachable", reason: "Europe PMC has no open-access full text for this DOI.",
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  });

  it("fetchFullTextByDoi reports HTTP errors with the code", async () => {
    for (const status of [302, 404, 429, 503]) {
      for (const step of [1, 2]) {
        const fetchImpl = vi.fn<FetchLike>();
        if (step === 2) fetchImpl.mockResolvedValueOnce(searchReply());
        fetchImpl.mockResolvedValueOnce(new Response(null, { status }));
        expect(await fetchFullTextByDoi("10.1234/error", fetchImpl)).toEqual({
          status: "unreachable", reason: `Europe PMC answered HTTP ${status}.`,
        });
        expect(fetchImpl).toHaveBeenCalledTimes(step);
      }
    }
  });

  it("fetchFullTextByDoi reports a thrown fetch", async () => {
    for (const step of [1, 2]) {
      const fetchImpl = vi.fn<FetchLike>();
      if (step === 2) fetchImpl.mockResolvedValueOnce(searchReply());
      fetchImpl.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      expect(await fetchFullTextByDoi("10.1234/offline", fetchImpl)).toEqual({
        status: "unreachable", reason: "Could not reach Europe PMC.",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(step);
    }
  });

  it("fetchFullTextByDoi reports invalid JSON", async () => {
    for (const body of ["{invalid", "null", "{}", '{"resultList":{"result":null}}']) {
      const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response(body));
      expect(await fetchFullTextByDoi("10.1234/invalid", fetchImpl)).toEqual({
        status: "unreachable", reason: "Europe PMC sent a reply that could not be read.",
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  });

  it("retains only complete sentences when the first paragraph exceeds the limit", async () => {
    const complete = "Treatment improved survival in adults.";
    const incomplete = "Survival improved " + "substantially ".repeat(10000) + ", but only in the exploratory subgroup.";
    const fetchImpl = vi.fn<FetchLike>()
      .mockResolvedValueOnce(searchReply())
      .mockResolvedValueOnce(new Response(`<article><body><p>${complete} ${incomplete}</p></body></article>`));
    const source = await fetchFullTextByDoi("10.1234/long", fetchImpl);
    expect(source).toEqual({ status: "ok", text: complete, origin: "europepmc", truncated: true });
    if (source.status === "ok") {
      expect(checkEvidence(complete, source.text)).toMatchObject({ ok: true });
      expect(checkEvidence(incomplete.slice(0, 100), source.text).ok).toBe(false);
    }
  });

  it("reports full text unavailable when no complete sentence fits within the limit", async () => {
    for (const paragraph of ["a".repeat(MAX_FULL_TEXT_CHARS + 1),
      "Treatment improved survival " + "substantially ".repeat(10000) + ", but not in the final analysis."]) {
      const fetchImpl = vi.fn<FetchLike>()
        .mockResolvedValueOnce(searchReply())
        .mockResolvedValueOnce(new Response(`<article><body><p>${paragraph}</p></body></article>`));
      expect(await fetchFullTextByDoi("10.1234/long", fetchImpl)).toEqual({
        status: "unreachable", reason: "Europe PMC full text has no complete sentence within the length limit.",
      });
    }
  });

  it("fetchFullTextByDoi truncates very long text at a paragraph boundary", async () => {
    expect(MAX_FULL_TEXT_CHARS).toBe(120000);
    for (const [paragraphs, expected] of [
      [["a".repeat(70000), "b".repeat(60000)], { status: "ok", text: "a".repeat(70000), origin: "europepmc", truncated: true }],
      [["a".repeat(120001)], { status: "unreachable", reason: "Europe PMC full text has no complete sentence within the length limit." }],
      [["a".repeat(120000)], { status: "ok", text: "a".repeat(120000), origin: "europepmc" }],
    ] satisfies [string[], SourceText][]) {
      const fetchImpl = vi.fn<FetchLike>()
        .mockResolvedValueOnce(searchReply())
        .mockResolvedValueOnce(new Response(`<article><body>${paragraphs.map((p) => `<p>${p}</p>`).join("")}</body></article>`));
      expect(await fetchFullTextByDoi("10.1234/long", fetchImpl)).toEqual(expected);
    }
  });
});
