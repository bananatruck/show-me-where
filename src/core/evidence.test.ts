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

  it("collapses whitespace runs and trims", () => {
    expect(normalizeForMatch("  a \n\t b  ")).toBe("a b");
  });

  it("applies NFKC so compatibility characters match their plain form", () => {
    expect(normalizeForMatch("\uFB01ve")).toBe("five");
  });

  it("keeps case", () => {
    expect(normalizeForMatch("Sleep")).toBe("Sleep");
  });
});

describe("checkEvidence", () => {
  it("accepts an exact sentence from the source", () => {
    expect(checkEvidence("Participants slept 7.1 hours on average.", SOURCE)).toEqual({
      ok: true,
    });
  });

  it("accepts a quote that differs only in quotes, dashes and whitespace", () => {
    const quote =
      'Sleep "quality" improved by 12% in the intervention group - but not in controls. The effect faded';
    expect(checkEvidence(quote, SOURCE)).toEqual({ ok: true });
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
    const result = checkEvidence("slept 7.1 hours", SOURCE);
    expect(result).toEqual({ ok: false, reason: "too_short" });
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
