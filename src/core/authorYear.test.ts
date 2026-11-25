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

describe("names the first version missed", () => {
  const refs = parseAuthorYearReferences(
    [
      "Garc\u00EDa, \u00C1., & L\u00F3pez, B. (2020). Accented initials.",
      "van der Berg, P. (2020). A particle surname.",
      "World Health Organization. (2021). Sleep guidance.",
      "de la Cruz, M., Ortiz, N., & Ruiz, O. (2019). Three authors.",
    ].join("\n"),
  );

  it("drops accented initials from surnames", () => {
    expect(surnamesOf("Garc\u00EDa, \u00C1., & L\u00F3pez, B.")).toEqual(["Garc\u00EDa", "L\u00F3pez"]);
    expect(findAuthorYearCitations("It held (Garc\u00EDa & L\u00F3pez, 2020).", refs).citations[0]?.refs).toEqual([1]);
  });

  it("reads a surname that starts with a lowercase particle", () => {
    expect(findAuthorYearCitations("It held (van der Berg, 2020).", refs).citations[0]?.refs).toEqual([2]);
    expect(findAuthorYearCitations("It held (de la Cruz et al., 2019).", refs).citations[0]?.refs).toEqual([4]);
  });

  it("reads a narrative citation by a group author, with the whole name in the span", () => {
    const sentence = "World Health Organization (2021) recommends more sleep.";
    expect(findAuthorYearCitations(sentence, refs).citations).toEqual([
      { start: 0, end: 32, refs: [3], narrative: true },
    ]);
  });

  it("reads a narrative citation after a capitalised opening word", () => {
    const { citations } = findAuthorYearCitations("Recently van der Berg (2020) showed it.", refs);
    expect(citations).toEqual([{ start: 9, end: 28, refs: [2], narrative: true }]);
  });

  it("reports a narrative citation that is not in the reference list", () => {
    expect(findAuthorYearCitations("Recently Brown (2018) found an increase.", refs)).toEqual({
      citations: [],
      unresolved: ["Brown, 2018"],
    });
  });

  it("still ignores parentheses that are not citations", () => {
    expect(findAuthorYearCitations("In spring (in 2020) it rose (n = 40).", refs)).toEqual({
      citations: [],
      unresolved: [],
    });
  });
});


describe("reference entries and author counts", () => {
  it("starts a new entry at an editor marker or a full date, so no DOI moves to the entry above", () => {
    const refs = parseAuthorYearReferences(
      [
        "Alder, M. (2025). Unrelated book without a DOI.",
        "Smith, J. (Ed.). (2020). Edited volume on vaccines. https://doi.org/10.1000/vaccine",
        "Brown, K., & Gray, L. (Eds.). (2019b). Another edited volume.",
        "Lane, P. (2020, May 14). News article. https://doi.org/10.1000/news",
      ].join("\n"),
    );
    expect(refs.map((r) => [r.authors, r.year, r.doi])).toEqual([
      [["Alder"], "2025", null],
      [["Smith"], "2020", "10.1000/vaccine"],
      [["Brown", "Gray"], "2019b", null],
      [["Lane"], "2020", "10.1000/news"],
    ]);
  });

  it("matches a two-name citation to the two-author entry, not the three-author one", () => {
    const refs = parseAuthorYearReferences(
      ["Smith, A., & Jones, B. (2020). Two authors.", "Smith, A., Jones, B., & Lee, C. (2020). Three authors."].join(
        "\n",
      ),
    );
    expect(findAuthorYearCitations("It held (Smith & Jones, 2020).", refs).citations[0]?.refs).toEqual([1]);
    expect(findAuthorYearCitations("It held (Smith et al., 2020).", refs).citations[0]?.refs).toEqual([2]);
  });

  it("does not match et al. to a single-author entry", () => {
    const refs = parseAuthorYearReferences("Smith, A. (2020). Single author.");
    expect(findAuthorYearCitations("It held (Smith et al., 2020).", refs)).toEqual({
      citations: [],
      unresolved: ["Smith et al., 2020"],
    });
  });
});

describe("narrative readings", () => {
  it("does not drop part of a compound surname to reach a different author", () => {
    const refs = parseAuthorYearReferences("M\u00E1rquez, A. (2020). Another author.");
    expect(findAuthorYearCitations("Garc\u00EDa M\u00E1rquez (2020) found it.", refs)).toEqual({
      citations: [],
      unresolved: ["Garc\u00EDa M\u00E1rquez, 2020"],
    });
  });

  it("keeps an apostrophe surname distinct from its suffix", () => {
    for (const apostrophe of ["'", "\u2019", "\u2018"]) {
      const surname = `O${apostrophe}Connor`;
      const refs = parseAuthorYearReferences(`Connor, A. (2020). First.\n${surname}, B. (2020). Second.`);
      const sentence = `${surname} (2020) found it.`;
      expect(findAuthorYearCitations(sentence, refs)).toEqual({
        citations: [{ start: 0, end: sentence.indexOf(" found"), refs: [2], narrative: true }],
        unresolved: [],
      });
      expect(findAuthorYearCitations("Connor (2020) found it.", refs).citations[0]?.refs).toEqual([1]);
      expect(findAuthorYearCitations("O'Connor (2020) found it.", refs).citations[0]?.refs).toEqual([2]);
    }
  });

  it("does not begin a narrative citation inside an unmatched name token", () => {
    const refs = parseAuthorYearReferences("Connor, A. (2020). First.");
    for (const prefix of ["o'", "o\u2019", "o\u2018", "o-", "o", "o\u0301"]) {
      expect(findAuthorYearCitations(`${prefix}Connor (2020) found it.`, refs).citations).toEqual([]);
    }
  });

  it("still drops an opening word such as Recently or However", () => {
    const refs = parseAuthorYearReferences("Brown, K. (2018). A study.");
    expect(findAuthorYearCitations("However, Brown (2018) found it.", refs).citations[0]?.refs).toEqual([1]);
    expect(findAuthorYearCitations("Recently Brown (2018) found it.", refs).citations[0]?.refs).toEqual([1]);
  });

  it("drops an opening The, but still prefers a group name that starts with The", () => {
    const refs = parseAuthorYearReferences(
      ["Smith, A., & Jones, B. (2020). Two authors.", "The Lancet Commission. (2021). A report."].join("\n"),
    );
    expect(
      findAuthorYearCitations("The Smith and Jones (2020) study found an increase.", refs).citations,
    ).toEqual([{ start: 4, end: 26, refs: [1], narrative: true }]);
    expect(
      findAuthorYearCitations("The Lancet Commission (2021) set targets.", refs).citations,
    ).toEqual([{ start: 0, end: 28, refs: [2], narrative: true }]);
  });
});
