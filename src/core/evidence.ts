/** A quoted piece of evidence must be at least this long after normalisation. */
export const MIN_EVIDENCE_LENGTH = 20;

// Hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar,
// minus sign, small and full-width hyphen-minus.
const DASHES = /[‐‑‒–—―−﹣－]/g;
const DOUBLE_QUOTES = /[“”„‟«»]/g;
const SINGLE_QUOTES = /[‘’‚‛]/g;

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
