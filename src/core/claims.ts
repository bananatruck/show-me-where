import { findAuthorYearCitations, type Citation } from "./authorYear";
import type { CitationStyle, Claim, Reference } from "./types";

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
  "p",
  "pp",
  "para",
  "ref",
  "refs",
  "dr",
  "prof",
  "mr",
  "mrs",
  "ms",
  "st",
  "jr",
  "sr",
  "mt",
  "dept",
  "univ",
  "inc",
  "ltd",
  "co",
  "corp",
  "assn",
  "ed",
  "eds",
  "est",
  "viz",
  "resp",
  "sec",
  "min",
  "hr",
  "hrs",
  "sp",
  "spp",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
]);

// Citation markers that stay with the sentence before them: any bracket right
// after the stop, or a numeric marker after a space, as in "It rose. [1]".
const MARKER_RUN = /^(?:\[[^\]\n]*\]|\s+\[\d[\d,\s\u2013-]*\])*/;

function isAbbreviation(textBeforeStop: string): boolean {
  const word = /([A-Za-z][A-Za-z.]*)$/.exec(textBeforeStop)?.[1];
  if (!word) return false;
  // A single capital letter is an initial, as in "J. Doe".
  if (/^[A-Z]$/.test(word)) return true;
  // Short letter groups joined by full stops: "J.A", "U.S", "Ph.D", "e.g".
  if (/^(?:[A-Za-z]{1,3}\.)+[A-Za-z]{1,3}$/.test(word)) return true;
  return ABBREVIATIONS.has(word.toLowerCase());
}

/**
 * Whether a word can open a sentence: a capital (any script), a digit, an
 * opening quote or bracket, a Greek letter as in "\u03B2-blockers", or a
 * lower-case word with a capital or digit inside, as in "mRNA" or "p53".
 */
function startsASentence(word: string): boolean {
  return /^(?:[\p{Lu}\p{N}"'([\u201C\u2018]|\p{Script=Greek}|\p{Ll}+[\p{Lu}\p{N}])/u.test(word);
}

/** One sentence's offsets in the text it came from. */
export interface SentenceSpan {
  start: number;
  /** Just after the closing punctuation and quotes, before any citation markers. */
  stop: number;
  /** Just after any citation markers that follow the sentence. */
  end: number;
}

function trimmedSpan(text: string, start: number, stop: number, end: number): SentenceSpan | null {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s] ?? "")) s += 1;
  while (e > s && /\s/.test(text[e - 1] ?? "")) e -= 1;
  if (s >= e) return null;
  return { start: s, stop: Math.min(Math.max(stop, s), e), end: e };
}

/**
 * Rule-based sentence splitter that keeps offsets. A sentence ends at ".",
 * "!" or "?" (plus any closing quotes and any citation markers after it)
 * when whitespace and then a capital letter, digit, quote, or bracket follow,
 * unless the full stop ends an abbreviation such as "e.g." or an initial.
 * A blank line always ends a sentence.
 */
export function sentenceSpans(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const paragraphs: [number, number][] = [];
  let from = 0;
  for (const sep of text.matchAll(/\n\s*\n/g)) {
    paragraphs.push([from, sep.index]);
    from = sep.index + sep[0].length;
  }
  paragraphs.push([from, text.length]);

  for (const [pStart, pEnd] of paragraphs) {
    let start = pStart;
    let i = pStart;
    while (i < pEnd) {
      const ch = text[i];
      if (ch === "." || ch === "!" || ch === "?") {
        let stop = i + 1;
        while (stop < pEnd && "\"')\u201D\u2019".includes(text[stop] ?? "")) stop += 1;
        const end = stop + (MARKER_RUN.exec(text.slice(stop, pEnd))?.[0].length ?? 0);
        const next = /^\s+(\S+)/.exec(text.slice(end, pEnd))?.[1];
        const boundary =
          next !== undefined &&
          startsASentence(next) &&
          // The last full stop of an ellipsis does not end a sentence.
          !(ch === "." && text[i - 1] === ".") &&
          !(ch === "." && isAbbreviation(text.slice(start, i)));
        if (boundary) {
          const span = trimmedSpan(text, start, stop, end);
          if (span) spans.push(span);
          start = end;
        }
        i = end;
      } else {
        i += 1;
      }
    }
    const last = trimmedSpan(text, start, pEnd, pEnd);
    if (last) {
      // A final sentence keeps its own stop when it ends in punctuation and markers.
      const tail = /[.!?]["')\u201D\u2019]*(?:\[[^\]\n]*\]|\s+\[\d[\d,\s\u2013-]*\])*$/.exec(
        text.slice(last.start, last.end),
      );
      if (tail) {
        const punct = /^[.!?]["')\u201D\u2019]*/.exec(tail[0])?.[0].length ?? 0;
        last.stop = last.start + tail.index + punct;
      }
      spans.push(last);
    }
  }
  return spans;
}

/** The sentences of a text, each with its whitespace collapsed. */
export function splitSentences(text: string): string[] {
  return sentenceSpans(text).map((span) => text.slice(span.start, span.end).replace(/\s+/g, " "));
}

const MARKER = /\s*\[(\d+(?:\s*[-\u2013]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-\u2013]\s*\d+)?)*)\]/g;
const MAX_RANGE = 50;

/** Expands "1, 3-5" into [1, 3, 4, 5], or null if any part is malformed. */
function expandMarker(inner: string): number[] | null {
  const out: number[] = [];
  for (const part of inner.split(",")) {
    const [a, b] = part.split(/[-\u2013]/).map((s) => Number(s.trim()));
    // Safe integers only: past 2^53, n += 1 no longer changes n and the loop never ends.
    if (a === undefined || !Number.isSafeInteger(a)) return null;
    if (b === undefined) {
      out.push(a);
      continue;
    }
    if (!Number.isSafeInteger(b) || b < a || b - a > MAX_RANGE) return null;
    for (let n = a; n <= b; n += 1) out.push(n);
  }
  return out;
}

/**
 * Finds numeric bracket citations. A marker counts only when every number in
 * it is a known reference; otherwise it is left in the text.
 */
export function findNumericCitations(
  sentence: string,
  knownRefs: ReadonlySet<number>,
): Citation[] {
  const citations: Citation[] = [];
  for (const match of sentence.matchAll(MARKER)) {
    const numbers = expandMarker(match[1] ?? "");
    if (!numbers || numbers.length === 0 || !numbers.every((n) => knownRefs.has(n))) continue;
    citations.push({
      start: match.index,
      end: match.index + match[0].length,
      refs: [...new Set(numbers)].sort((a, b) => a - b),
      narrative: false,
    });
  }
  return citations;
}

function tidy(text: string): string {
  return text.replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim();
}

/** Removes the given citation spans from a sentence. */
function removeSpans(sentence: string, spans: readonly Citation[]): string {
  let out = "";
  let at = 0;
  for (const span of spans) {
    out += sentence.slice(at, span.start);
    at = span.end;
  }
  return out + sentence.slice(at);
}

const MIN_SCOPE_WORDS = 3;

/**
 * The part of the sentence each citation is attached to. A sentence is split
 * only when it is safe: every citation is parenthetical, there are at least
 * two, nothing but punctuation follows the last one (so no shared predicate
 * is cut off, as in "Studies [1] and trials [2] proved X"), and every part has
 * at least three words. Otherwise every source is checked against the whole
 * sentence. A reference cited twice is always checked against the whole.
 */
function scopesFor(sentence: string, citations: readonly Citation[], text: string): Record<number, string> {
  const whole: Record<number, string> = {};
  for (const c of citations) for (const r of c.refs) whole[r] = text;

  const last = citations.at(-1);
  if (
    citations.length < 2 ||
    citations.some((c) => c.narrative) ||
    !last ||
    !/^[\s.!?;:,"')\]\u201D\u2019]*$/.test(sentence.slice(last.end))
  ) {
    return whole;
  }

  const seen = new Map<number, number>();
  for (const c of citations) for (const r of c.refs) seen.set(r, (seen.get(r) ?? 0) + 1);
  const scopes: Record<number, string> = {};
  let previousEnd = 0;
  for (const c of citations) {
    const segment = tidy(sentence.slice(previousEnd, c.start)).replace(/^[,;:]\s*/, "");
    if (segment.split(/\s+/).filter(Boolean).length < MIN_SCOPE_WORDS) return whole;
    for (const r of c.refs) scopes[r] = (seen.get(r) ?? 0) > 1 ? text : segment;
    previousEnd = c.end;
  }
  return scopes;
}

/** Numeric citations removed from a sentence, kept for the marker grammar tests. */
export function parseMarkers(
  sentence: string,
  knownRefs: ReadonlySet<number>,
): { refs: number[]; text: string } {
  const citations = findNumericCitations(sentence, knownRefs);
  return {
    refs: [...new Set(citations.flatMap((c) => c.refs))].sort((a, b) => a - b),
    text: tidy(removeSpans(sentence, citations)),
  };
}

/** Builds the claim list: every sentence with at least one resolved citation. */
export function extractClaims(
  body: string,
  style: CitationStyle,
  references: readonly Reference[],
): { claims: Claim[]; uncited: string[]; unresolved: string[] } {
  const known = new Set(references.map((r) => r.number));
  const claims: Claim[] = [];
  const uncited: string[] = [];
  const unresolved: string[] = [];
  for (const sentence of splitSentences(body)) {
    let citations: Citation[];
    if (style === "numeric") {
      citations = findNumericCitations(sentence, known);
    } else {
      const found = findAuthorYearCitations(sentence, references);
      citations = found.citations;
      unresolved.push(...found.unresolved);
    }
    if (citations.length === 0) {
      uncited.push(sentence);
      continue;
    }
    const text = tidy(removeSpans(sentence, citations.filter((c) => !c.narrative)));
    claims.push({
      id: `c${claims.length + 1}`,
      text,
      sentence,
      refs: [...new Set(citations.flatMap((c) => c.refs))].sort((a, b) => a - b),
      scopes: scopesFor(sentence, citations, text),
    });
  }
  return { claims, uncited, unresolved: [...new Set(unresolved)] };
}
