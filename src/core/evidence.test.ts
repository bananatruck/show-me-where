import { describe, expect, it } from "vitest";
import { MIN_EVIDENCE_LENGTH, checkEvidence, normalizeForMatch } from "./evidence";

const SOURCE =
  "Participants slept 7.1 hours on average. Sleep \u201Cquality\u201D improved by 12% in the intervention group \u2013 but not in controls.\nThe effect faded after six weeks.";

describe("normalizeForMatch", () => {
  it("turns curly quotes into straight quotes", () => {
    expect(normalizeForMatch("\u201Cquality\u201D \u2018x\u2019")).toBe("\"quality\" 'x'");
  });

  it("turns every dash and hyphen variant into a plain hyphen", () => {
    expect(normalizeForMatch("a\u2010b\u2011c\u2012d\u2013e\u2014f\u2212g")).toBe(
      "a-b-c-d-e-f-g",
    );
  });

  it("collapses whitespace runs, including non-breaking spaces, and trims", () => {
    expect(normalizeForMatch("  a \n\t\u00A0b\u202Fc  ")).toBe("a b c");
  });

  it("expands typographic ligatures", () => {
    expect(normalizeForMatch("\uFB01ve \uFB02at")).toBe("five flat");
  });

  it("keeps superscript digits distinct from plain digits", () => {
    expect(normalizeForMatch("10\u2076")).not.toBe(normalizeForMatch("106"));
  });

  it("removes soft hyphens and zero-width characters", () => {
    expect(normalizeForMatch("signi\u00ADficantly re\u200Bduced\uFEFF")).toBe("significantly reduced");
  });

  it("keeps case", () => {
    expect(normalizeForMatch("Sleep")).toBe("Sleep");
  });
});

describe("checkEvidence", () => {
  it("accepts a whole sentence from the source and gives its neighbours", () => {
    expect(checkEvidence("Participants slept 7.1 hours on average.", SOURCE)).toEqual({
      ok: true,
      before: "",
      after:
        'Sleep "quality" improved by 12% in the intervention group - but not in controls.',
    });
  });

  it("accepts several whole sentences that differ only in quotes, dashes and whitespace", () => {
    const quote =
      'Sleep "quality" improved by 12% in the intervention group - but not in controls. The effect faded after six weeks.';
    expect(checkEvidence(quote, SOURCE)).toMatchObject({
      ok: true,
      before: "Participants slept 7.1 hours on average.",
      after: "",
    });
  });

  it("accepts a quote wrapped in one pair of quotation marks", () => {
    expect(checkEvidence("\u201CThe effect faded after six weeks.\u201D", SOURCE)).toMatchObject({
      ok: true,
    });
  });

  it("rejects part of a sentence, which could drop a negation", () => {
    const source = "We found no evidence that fasting raises resting metabolic rate in adults.";
    expect(checkEvidence("fasting raises resting metabolic rate in adults.", source)).toEqual({
      ok: false,
      reason: "not_full_sentence",
    });
  });

  it("rejects a quote that stops in the middle of a sentence", () => {
    expect(checkEvidence("Participants slept 7.1 hours", SOURCE)).toEqual({
      ok: false,
      reason: "not_full_sentence",
    });
  });

  it("rejects a quote with one changed word", () => {
    const result = checkEvidence("Participants slept 8.1 hours on average.", SOURCE);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects a quote whose case differs", () => {
    const result = checkEvidence("participants slept 7.1 hours on average.", SOURCE);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects a quote shorter than the minimum length", () => {
    expect(MIN_EVIDENCE_LENGTH).toBe(20);
    expect(checkEvidence("It faded.", "It faded. Then more.")).toEqual({
      ok: false,
      reason: "too_short",
    });
  });

  it("rejects an empty quote", () => {
    expect(checkEvidence("   ", SOURCE)).toEqual({ ok: false, reason: "too_short" });
  });

  it("rejects any quote when the source is empty", () => {
    expect(checkEvidence("Participants slept 7.1 hours on average.", "")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
