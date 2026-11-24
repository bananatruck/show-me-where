import { splitSentences } from "./claims";

/** A quoted piece of evidence must be at least this long after normalisation. */
export const MIN_EVIDENCE_LENGTH = 20;

// Hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar,
// minus sign, small and full-width hyphen-minus.
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE63\uFF0D]/g;
const DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g;
const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B]/g;
// Soft hyphen, zero-width space, joiners, word joiner, byte order mark.
const INVISIBLE = /\u00AD|\u200B|\u200C|\u200D|\u2060|\uFEFF/g;
const LIGATURES: Record<string, string> = {
  "\uFB00": "ff",
  "\uFB01": "fi",
  "\uFB02": "fl",
  "\uFB03": "ffi",
  "\uFB04": "ffl",
  "\uFB05": "st",
  "\uFB06": "st",
};

/**
 * The only normalisation allowed before matching: NFC (not NFKC, which would
 * turn a superscript 10\u2076 into 106), ligatures expanded, invisible characters
 * removed, straight quotes, plain hyphens, and single spaces. Case is kept.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\uFB00-\uFB06]/g, (ch) => LIGATURES[ch] ?? ch)
    .replace(INVISIBLE, "")
    .replace(DOUBLE_QUOTES, '"')
    .replace(SINGLE_QUOTES, "'")
    .replace(DASHES, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export type EvidenceCheck =
  | { ok: true; before: string; after: string }
  | { ok: false; reason: "too_short" | "not_found" | "not_full_sentence" };

const SENTENCE_END = /[.!?]["')\]]*$/;

function startsSentence(source: string, at: number): boolean {
  return at === 0 || /[.!?]["')\]]*\s$/.test(source.slice(Math.max(0, at - 4), at));
}

function endsSentence(source: string, quote: string, end: number): boolean {
  return end === source.length || (SENTENCE_END.test(quote) && /^\s/.test(source.slice(end)));
}

function stripOuterQuotes(quote: string): string {
  const m = /^"(.*)"$/s.exec(quote);
  return m?.[1]?.trim() ?? quote;
}

/**
 * True only when the quote is one or more whole sentences that occur
 * literally in the source after normalizeForMatch on both sides. A fragment
 * of a sentence is rejected, because a fragment can drop a negation or a
 * qualifier. On success, also returns the sentences just before and after.
 */
export function checkEvidence(quote: string, source: string): EvidenceCheck {
  const q = stripOuterQuotes(normalizeForMatch(quote));
  if (q.length < MIN_EVIDENCE_LENGTH) {
    return { ok: false, reason: "too_short" };
  }
  const s = normalizeForMatch(source);
  let found = false;
  for (let at = s.indexOf(q); at !== -1; at = s.indexOf(q, at + 1)) {
    found = true;
    const end = at + q.length;
    if (startsSentence(s, at) && endsSentence(s, q, end)) {
      return {
        ok: true,
        before: splitSentences(s.slice(0, at)).at(-1) ?? "",
        after: splitSentences(s.slice(end)).at(0) ?? "",
      };
    }
  }
  return { ok: false, reason: found ? "not_full_sentence" : "not_found" };
}
