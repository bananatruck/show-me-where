import { describe, expect, it } from "vitest";
import { parseAuthorYearReferences } from "./authorYear";
import { extractClaims, parseMarkers, splitSentences } from "./claims";
import type { Reference } from "./types";

describe("splitSentences", () => {
  it("splits on sentence-ending punctuation followed by a capital", () => {
    expect(splitSentences("One is here. Two is here! Three? Four.")).toEqual([
      "One is here.",
      "Two is here!",
      "Three?",
      "Four.",
    ]);
  });

  it("does not split after common abbreviations or initials", () => {
    expect(
      splitSentences("Smith et al. Found it, e.g. In mice. Prof. Lee and J. Doe agree. Next."),
    ).toEqual(["Smith et al. Found it, e.g. In mice.", "Prof. Lee and J. Doe agree.", "Next."]);
  });

  it("does not split inside decimal numbers", () => {
    expect(splitSentences("It rose 7.1 percent. Then fell.")).toEqual([
      "It rose 7.1 percent.",
      "Then fell.",
    ]);
  });

  it("keeps a marker placed after the full stop with its sentence", () => {
    expect(splitSentences("It rose.[1] Then fell [2].")).toEqual(["It rose.[1]", "Then fell [2]."]);
  });

  it("keeps a numeric marker separated from the full stop by a space with its sentence", () => {
    expect(splitSentences("It rose. [1] Then fell [2].")).toEqual(["It rose. [1]", "Then fell [2]."]);
  });

  it("does not attach a bracketed word to the previous sentence", () => {
    expect(splitSentences("See below. [Table 1] shows the data.")).toEqual([
      "See below.",
      "[Table 1] shows the data.",
    ]);
  });

  it("always splits at a blank line", () => {
    expect(splitSentences("A heading\n\nThe text.")).toEqual(["A heading", "The text."]);
  });

  it("returns nothing for blank input", () => {
    expect(splitSentences("  \n ")).toEqual([]);
  });
});

describe("parseMarkers", () => {
  const known = new Set([1, 2, 3, 4]);

  it("reads single, list and range markers", () => {
    expect(parseMarkers("A [1] and B [2, 4] and C [1-3].", known)).toEqual({
      refs: [1, 2, 3, 4],
      text: "A and B and C.",
    });
  });

  it("accepts an en dash in a range", () => {
    expect(parseMarkers("A [2\u20133].", known).refs).toEqual([2, 3]);
  });

  it("leaves a bracketed number that is not a known reference as text", () => {
    expect(parseMarkers("In [2019] it rose [1].", known)).toEqual({
      refs: [1],
      text: "In [2019] it rose.",
    });
  });

  it("returns no refs when there are no markers", () => {
    expect(parseMarkers("Plain sentence.", known)).toEqual({
      refs: [],
      text: "Plain sentence.",
    });
  });

  it("ignores a range whose ends are not safe integers instead of looping forever", () => {
    expect(parseMarkers("A [9007199254740992-9007199254740992].", known)).toEqual({
      refs: [],
      text: "A [9007199254740992-9007199254740992].",
    });
  });

  it("ignores a reversed or oversized range", () => {
    expect(parseMarkers("A [3-1] B [1-999].", known)).toEqual({
      refs: [],
      text: "A [3-1] B [1-999].",
    });
  });
});

function numericRefs(numbers: number[]): Reference[] {
  return numbers.map((n) => ({ number: n, raw: `Ref ${n}`, doi: null, label: `[${n}]`, authors: [], year: null }));
}

describe("extractClaims", () => {
  it("returns cited sentences as claims and lists uncited ones", () => {
    const body =
      "Sleep improves memory [1]. This matters for students. Naps help too [2, 3].";
    expect(extractClaims(body, "numeric", numericRefs([1, 2, 3]))).toEqual({
      claims: [
        {
          id: "c1",
          text: "Sleep improves memory.",
          sentence: "Sleep improves memory [1].",
          refs: [1],
          scopes: { 1: "Sleep improves memory." },
        },
        {
          id: "c2",
          text: "Naps help too.",
          sentence: "Naps help too [2, 3].",
          refs: [2, 3],
          scopes: { 2: "Naps help too.", 3: "Naps help too." },
        },
      ],
      uncited: ["This matters for students."],
      unresolved: [],
    });
  });

  it("scopes each citation to the part of the sentence it follows", () => {
    const { claims } = extractClaims(
      "Memory scores rose sharply [1], while reaction times did not change at all [2].",
      "numeric",
      numericRefs([1, 2]),
    );
    expect(claims[0]?.scopes).toEqual({
      1: "Memory scores rose sharply",
      2: "while reaction times did not change at all",
    });
  });

  it("checks the known references in a bracket and reports the unknown ones", () => {
    const { claims, uncited, unresolved } = extractClaims(
      "Mortality fell by 50% [1, 3]. Naps improve recall [4]. In [2019] it rose.",
      "numeric",
      numericRefs([1, 2]),
    );
    expect(claims.map((c) => [c.text, c.refs])).toEqual([["Mortality fell by 50%.", [1]]]);
    expect(uncited).toEqual(["Naps improve recall [4].", "In [2019] it rose."]);
    expect(unresolved).toEqual(["[3]", "[4]"]);
  });

  it("uses the whole sentence when words follow the last citation", () => {
    const sentence =
      "Earlier clinical studies [1] and recent patient trials [2] proved that bleach cures COVID-19 in humans.";
    const { claims } = extractClaims(sentence, "numeric", numericRefs([1, 2]));
    const whole = "Earlier clinical studies and recent patient trials proved that bleach cures COVID-19 in humans.";
    expect(claims[0]?.scopes).toEqual({ 1: whole, 2: whole });
  });

  it("uses the whole sentence when a narrative citation is mixed with parenthetical ones", () => {
    const references = parseAuthorYearReferences(
      [
        "Smith, A. (2020). One.",
        "Jones, B. (2021). Two.",
        "Lee, C. (2022). Three.",
      ].join("\n"),
    );
    const { claims } = extractClaims(
      "Smith (2020) showed that exercise improves mood (Jones, 2021), while bleach cures COVID-19 (Lee, 2022).",
      "author_year",
      references,
    );
    const whole = "Smith (2020) showed that exercise improves mood, while bleach cures COVID-19.";
    expect(claims[0]?.scopes).toEqual({ 1: whole, 2: whole, 3: whole });
  });

  it("falls back to the whole sentence when a scope would be too short", () => {
    const { claims } = extractClaims("Naps [1] help recall [2].", "numeric", numericRefs([1, 2]));
    expect(claims[0]?.scopes).toEqual({ 1: "Naps help recall.", 2: "Naps help recall." });
  });

  it("reads author-year citations, keeps narrative ones in the text, and reports unresolved ones", () => {
    const references = parseAuthorYearReferences(
      [
        "Smith, J. A., & Jones, B. (2020). Sleep and memory.",
        "Lee, C., Park, D., & Kim, E. (2019). Naps and recall.",
      ].join("\n"),
    );
    const body = [
      "Smith and Jones (2020) found that sleep improves memory.",
      "Naps also help recall (Lee et al., 2019, p. 4; Smith & Jones, 2020).",
      "Caffeine hurts sleep (Brown, 2018).",
    ].join(" ");
    expect(extractClaims(body, "author_year", references)).toEqual({
      claims: [
        {
          id: "c1",
          text: "Smith and Jones (2020) found that sleep improves memory.",
          sentence: "Smith and Jones (2020) found that sleep improves memory.",
          refs: [1],
          scopes: { 1: "Smith and Jones (2020) found that sleep improves memory." },
        },
        {
          id: "c2",
          text: "Naps also help recall.",
          sentence: "Naps also help recall (Lee et al., 2019, p. 4; Smith & Jones, 2020).",
          refs: [1, 2],
          scopes: { 1: "Naps also help recall.", 2: "Naps also help recall." },
        },
      ],
      uncited: ["Caffeine hurts sleep (Brown, 2018)."],
      unresolved: ["Brown, 2018"],
    });
  });
});
