import type { Claim } from "./types";

/** Words that end in a full stop without ending the sentence. */
const ABBREVIATIONS = new Set([
  "al",
  "e.g",
  "i.e",
  "cf",
  "vs",
  "approx",
  "ca",
  "fig",
  "figs",
  "eq",
  "eqs",
  "no",
  "vol",
  "pp",
  "ref",
  "refs",
  "dr",
  "prof",
  "mr",
  "mrs",
  "ms",
  "st",
]);

const MARKER_RUN = /^(?:\[[^\]\n]*\])*/;

function isAbbreviation(textBeforeStop: string): boolean {
  const word = /([A-Za-z][A-Za-z.]*)$/.exec(textBeforeStop)?.[1];
  if (!word) return false;
  // A single capital letter is an initial, as in "J. Doe".
  if (/^[A-Z]$/.test(word)) return true;
  return ABBREVIATIONS.has(word.toLowerCase());
}

/**
 * Rule-based sentence splitter. A sentence ends at ".", "!" or "?" (plus any
 * closing quotes and any citation markers right after it) when whitespace and
 * then a capital letter, digit, quote, or bracket follow. A blank line always
 * ends a sentence.
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    let start = 0;
    let i = 0;
    while (i < paragraph.length) {
      const ch = paragraph[i];
      if (ch === "." || ch === "!" || ch === "?") {
        let end = i + 1;
        while (end < paragraph.length && "\"')\u201D\u2019".includes(paragraph[end] ?? "")) {
          end += 1;
        }
        end += MARKER_RUN.exec(paragraph.slice(end))?.[0].length ?? 0;
        const rest = paragraph.slice(end);
        const next = /^\s+(\S)/.exec(rest)?.[1];
        const boundary =
          next !== undefined &&
          /[A-Z0-9"'([\u201C\u2018]/.test(next) &&
          !(ch === "." && isAbbreviation(paragraph.slice(start, i)));
        if (boundary) {
          sentences.push(paragraph.slice(start, end));
          start = end;
        }
        i = end;
      } else {
        i += 1;
      }
    }
    sentences.push(paragraph.slice(start));
  }
  return sentences.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s !== "");
}

const MARKER = /\s*\[(\d+(?:\s*[-\u2013]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-\u2013]\s*\d+)?)*)\]/g;
const MAX_RANGE = 50;

/** Expands "1, 3-5" into [1, 3, 4, 5], or null if any part is malformed. */
function expandMarker(inner: string): number[] | null {
  const out: number[] = [];
  for (const part of inner.split(",")) {
    const [a, b] = part.split(/[-\u2013]/).map((s) => Number(s.trim()));
    if (a === undefined || !Number.isInteger(a)) return null;
    if (b === undefined) {
      out.push(a);
      continue;
    }
    if (!Number.isInteger(b) || b < a || b - a > MAX_RANGE) return null;
    for (let n = a; n <= b; n += 1) out.push(n);
  }
  return out;
}

/**
 * Finds numeric bracket citations. A marker counts only when every number in
 * it is a known reference; otherwise it is left in the text.
 */
export function parseMarkers(
  sentence: string,
  knownRefs: ReadonlySet<number>,
): { refs: number[]; text: string } {
  const refs = new Set<number>();
  const text = sentence.replace(MARKER, (whole, inner: string) => {
    const numbers = expandMarker(inner);
    if (!numbers || numbers.length === 0 || !numbers.every((n) => knownRefs.has(n))) {
      return whole;
    }
    numbers.forEach((n) => refs.add(n));
    return "";
  });
  return {
    refs: [...refs].sort((a, b) => a - b),
    text: text.replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim(),
  };
}

/** Builds the claim list: every sentence with at least one known citation. */
export function extractClaims(
  body: string,
  knownRefs: ReadonlySet<number>,
): { claims: Claim[]; uncited: string[] } {
  const claims: Claim[] = [];
  const uncited: string[] = [];
  for (const sentence of splitSentences(body)) {
    const { refs, text } = parseMarkers(sentence, knownRefs);
    if (refs.length === 0) {
      uncited.push(sentence);
    } else {
      claims.push({ id: `c${claims.length + 1}`, text, sentence, refs });
    }
  }
  return { claims, uncited };
}
