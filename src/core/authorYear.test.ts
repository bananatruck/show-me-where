import { describe, expect, it } from "vitest";
import {
  findAuthorYearCitations,
  matchKey,
  parseAuthorYearReferences,
  surnamesOf,
} from "./authorYear";

const LIST = [
  "Smith, J. A., & Jones, B. (2020). Sleep and memory in students. Journal of Sleep, 1(2), 3-9. https://doi.org/10.1000/sleep.1",
  "",
  "Lee, C., Park, D., & Kim, E. (2019a). Naps and recall.",
  "    Memory Journal, 4, 10-20.",
  "Lee, C., Park, D., & Kim, E. (2019b). A second paper by the same team.",
  "World Health Organization. (2021). Sleep guidance. https://example.org/who",
  "M\u00FCller, F. (n.d.). Undated report.",
].join("\n");

describe("surnamesOf", () => {
  it("drops initials and the ampersand", () => {
    expect(surnamesOf("Smith, J. A., Jones, B., & Lee, C.")).toEqual(["Smith", "Jones", "Lee"]);
  });

  it("keeps a group author whole", () => {
    expect(surnamesOf("World Health Organization.")).toEqual(["World Health Organization"]);
  });

  it("keeps hyphenated and particle surnames", () => {
    expect(surnamesOf("Garc\u00EDa-L\u00F3pez, M., & van der Berg, P.")).toEqual([
      "Garc\u00EDa-L\u00F3pez",
      "van der Berg",
    ]);
  });
});

describe("parseAuthorYearReferences", () => {
  const refs = parseAuthorYearReferences(LIST);

  it("finds one entry per author-and-year line, joining wrapped lines", () => {
    expect(refs.map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
    expect(refs[1]?.raw).toBe(
      "Lee, C., Park, D., & Kim, E. (2019a). Naps and recall. Memory Journal, 4, 10-20.",
    );
  });

  it("reads authors, year, DOI and a display label", () => {
    expect(refs[0]).toMatchObject({
      authors: ["Smith", "Jones"],
      year: "2020",
      doi: "10.1000/sleep.1",
      label: "Smith & Jones, 2020",
    });
    expect(refs[1]).toMatchObject({ year: "2019a", label: "Lee et al., 2019a" });
    expect(refs[3]).toMatchObject({
      authors: ["World Health Organization"],
      year: "2021",
      label: "World Health Organization, 2021",
    });
    expect(refs[4]).toMatchObject({ authors: ["M\u00FCller"], year: "n.d." });
  });
});

describe("findAuthorYearCitations", () => {
  const refs = parseAuthorYearReferences(LIST);

  it("finds a parenthetical citation and its span", () => {
    const sentence = "Sleep helps memory (Smith & Jones, 2020).";
    const { citations, unresolved } = findAuthorYearCitations(sentence, refs);
    expect(unresolved).toEqual([]);
    expect(citations).toEqual([
      { start: 18, end: 40, refs: [1], narrative: false },
    ]);
    expect(sentence.slice(18, 40)).toBe(" (Smith & Jones, 2020)");
  });

  it("accepts 'and', et al., page numbers, prefixes and several sources", () => {
    const { citations } = findAuthorYearCitations(
      "Naps help (see Lee et al., 2019a, p. 12; Smith and Jones, 2020) and so on.",
      refs,
    );
    expect(citations.map((c) => c.refs)).toEqual([[1, 2]]);
  });

  it("reads several years for one author group", () => {
    const { citations } = findAuthorYearCitations("Teams agree (Lee et al., 2019a, 2019b).", refs);
    expect(citations[0]?.refs).toEqual([2, 3]);
  });

  it("finds a narrative citation", () => {
    const { citations } = findAuthorYearCitations(
      "Smith and Jones (2020) found that sleep helps memory.",
      refs,
    );
    expect(citations).toEqual([{ start: 0, end: 22, refs: [1], narrative: true }]);
  });

  it("matches group authors and accented names", () => {
    const { citations } = findAuthorYearCitations(
      "Adults need sleep (World Health Organization, 2021; Muller, n.d.).",
      refs,
    );
    expect(citations[0]?.refs).toEqual([4, 5]);
  });

  it("reports a citation that is not in the reference list", () => {
    const { citations, unresolved } = findAuthorYearCitations(
      "It rose (Brown, 2018; Smith & Jones, 2020).",
      refs,
    );
    expect(citations[0]?.refs).toEqual([1]);
    expect(unresolved).toEqual(["Brown, 2018"]);
  });

  it("does not resolve an ambiguous citation", () => {
    const { citations, unresolved } = findAuthorYearCitations(
      "It rose (Lee et al., 2019).",
      refs,
    );
    expect(citations).toEqual([]);
    expect(unresolved).toEqual(["Lee et al., 2019"]);
  });

  it("ignores parentheses that are not citations", () => {
    expect(findAuthorYearCitations("In spring (in 2020) it rose (n = 40).", refs)).toEqual({
      citations: [],
      unresolved: [],
    });
  });
});

describe("matchKey", () => {
  it("folds case and accents", () => {
    expect(matchKey("M\u00FCller")).toBe(matchKey("muller"));
  });
});
