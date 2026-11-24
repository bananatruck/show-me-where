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

  it("does not treat an abbreviation as the start of a sentence", () => {
    const source = "We found no evidence that e.g. fasting raises resting metabolic rate in adults.";
    expect(checkEvidence("fasting raises resting metabolic rate in adults.", source)).toEqual({
      ok: false,
      reason: "not_full_sentence",
    });
  });

  it("does not treat an abbreviation as the end of a sentence", () => {
    const source = "Benefits were seen in some fruit, e.g. apples, but not in pears. Next sentence here.";
    expect(checkEvidence("Benefits were seen in some fruit, e.g.", source)).toEqual({
      ok: false,
      reason: "not_full_sentence",
    });
  });

  it("accepts a whole sentence quoted without the citation marker that follows it", () => {
    const source = "Naps improved recall on the same day.[3] Longer naps caused grogginess.";
    expect(checkEvidence("Naps improved recall on the same day.", source)).toMatchObject({
      ok: true,
      after: "Longer naps caused grogginess.",
    });
  });

  it.each([
    ["We found no benefit, unlike J.A. Smith who reported that survival doubled in all patients.", "Smith who reported that survival doubled in all patients."],
    ["We found no benefit in the U.S. Patients in early unblinded cohorts appeared to improve.", "Patients in early unblinded cohorts appeared to improve."],
    ["We found no benefit ... Patients in the rumor mill claimed a cure.", "Patients in the rumor mill claimed a cure."],
    ["No trial by the Dept. Health Services showed that the drug cured anyone.", "Health Services showed that the drug cured anyone."],
  ])("rejects a fragment that starts after an abbreviation or ellipsis in %j", (source, quote) => {
    expect(checkEvidence(quote, source)).toEqual({ ok: false, reason: "not_full_sentence" });
  });

  it.each([
    ["We sequenced the tissue. mRNA expression increased threefold in treated mice.", "mRNA expression increased threefold in treated mice."],
    ["We tested two doses. p53 levels doubled at the higher dose.", "p53 levels doubled at the higher dose."],
    ["We tested two drugs. \u03B2-blockers lowered pressure in most patients.", "\u03B2-blockers lowered pressure in most patients."],
    ["We read French work. \u00C9tudes show the same trend in adults.", "\u00C9tudes show the same trend in adults."],
  ])("accepts a sentence that starts with a lower-case or non-ASCII word in %j", (source, quote) => {
    expect(checkEvidence(quote, source)).toMatchObject({ ok: true });
  });

  it("treats a paragraph break as a sentence boundary, as after a heading", () => {
    const source = "Results\n\nSurvival increased by 20% in the treatment group.";
    expect(checkEvidence("Survival increased by 20% in the treatment group.", source)).toEqual({
      ok: true,
      before: "Results",
      after: "",
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
