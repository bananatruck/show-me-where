/** A quoted piece of evidence must be at least this long after normalisation. */
export const MIN_EVIDENCE_LENGTH = 20;

// Hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar,
// minus sign, small and full-width hyphen-minus.
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE63\uFF0D]/g;
const DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g;
const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B]/g;

/**
 * The only normalisation allowed before matching: NFKC, straight quotes,
 * plain hyphens, and single spaces. Case is kept.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(DOUBLE_QUOTES, '"')
    .replace(SINGLE_QUOTES, "'")
    .replace(DASHES, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export type EvidenceCheck =
  | { ok: true }
  | { ok: false; reason: "too_short" | "not_found" };

/**
 * True only when the quote occurs literally in the source after
 * normalizeForMatch on both sides. No other fuzzy matching is done.
 */
export function checkEvidence(quote: string, source: string): EvidenceCheck {
  const q = normalizeForMatch(quote);
  if (q.length < MIN_EVIDENCE_LENGTH) {
    return { ok: false, reason: "too_short" };
  }
  if (!normalizeForMatch(source).includes(q)) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true };
}
